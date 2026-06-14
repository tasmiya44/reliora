import express, { Request, Response, NextFunction } from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import {
  S3Client,
  PutObjectCommand,
  ListObjectsV2Command,
  DeleteObjectCommand,
  GetObjectCommand,
  CopyObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import dotenv from 'dotenv';
import sharp from 'sharp';
import crypto from 'crypto';
import fs from 'fs/promises';
import { OAuth2Client } from 'google-auth-library';

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT || 3000);
const HOST = '0.0.0.0';
const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret';
const BUCKET_NAME = process.env.AWS_S3_BUCKET_NAME || '';
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || process.env.VITE_GOOGLE_CLIENT_ID || '';
const DEMO_MESSAGE = 'Demo Mode: Please login or sign up to upload and manage your own gallery.';
const DEFAULT_FOLDERS = ['scenery', 'reezo', 'other'];
const RESERVED_FOLDERS = new Set(['all', 'favourites', 'favorites', 'thumbnails', 'previews']);

const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
  },
});
const googleOAuthClient = new OAuth2Client(GOOGLE_CLIENT_ID);

app.use(cors());
app.use(express.json());
app.use(cookieParser());

type UserRole = 'user' | 'admin' | 'demo';

interface UserDoc {
  _id: string;
  name: string;
  email: string;
  username: string;
  passwordHash: string;
  role: UserRole;
  createdAt: string;
  provider?: 'local' | 'google';
  googleId?: string;
  avatar?: string;
  emailVerified?: boolean;
}

interface FolderDoc {
  _id: string;
  userId: string;
  name: string;
  createdAt: string;
  coverPhotoId?: string;
  isUserCreated?: boolean;
}

interface PhotoDoc {
  _id: string;
  userId: string;
  folderId: string;
  folderName: string;
  filename: string;
  s3Key: string;
  thumbKey: string;
  previewKey: string;
  size: number;
  uploadedAt: string;
  deletedAt?: string;
  editedFrom?: string;
  isEditedCopy?: boolean;
}

interface FavoriteDoc {
  _id: string;
  userId: string;
  photoId: string;
}

interface DatabaseShape {
  users: UserDoc[];
  folders: FolderDoc[];
  photos: PhotoDoc[];
  favorites: FavoriteDoc[];
}

interface AuthUser {
  id: string;
  username: string;
  name: string;
  role: UserRole;
}

type AuthedRequest = Request & { user: AuthUser };
type CreateUserInput = {
  name: string;
  email: string;
  username: string;
  passwordHash: string;
  role?: UserRole;
  provider?: 'local' | 'google';
  googleId?: string;
  avatar?: string;
  emailVerified?: boolean;
};

interface MetadataStore {
  ensureSeedData(): Promise<void>;
  createUser(input: CreateUserInput): Promise<UserDoc>;
  updateUser(user: UserDoc): Promise<void>;
  findUserByLogin(login: string): Promise<UserDoc | null>;
  findUserByEmail(email: string): Promise<UserDoc | null>;
  findUserByUsername(username: string): Promise<UserDoc | null>;
  findUserById(id: string): Promise<UserDoc | null>;
  ensureDemoUser(): Promise<UserDoc>;
  listFolders(userId: string): Promise<FolderDoc[]>;
  findFolder(userId: string, name: string): Promise<FolderDoc | null>;
  createFolder(userId: string, name: string): Promise<FolderDoc>;
  renameFolder(userId: string, oldName: string, newName: string): Promise<FolderDoc | null>;
  deleteFolder(userId: string, name: string): Promise<{ folder: FolderDoc | null; photos: PhotoDoc[] }>;
  deleteFolderOnly(userId: string, name: string): Promise<FolderDoc | null>;
  listPhotos(userId: string): Promise<PhotoDoc[]>;
  listDeletedPhotos(userId: string): Promise<PhotoDoc[]>;
  createPhoto(input: Omit<PhotoDoc, '_id' | 'uploadedAt'>): Promise<PhotoDoc>;
  findPhotoByDisplayKey(userId: string, key: string): Promise<PhotoDoc | null>;
  updatePhoto(photo: PhotoDoc): Promise<void>;
  deletePhoto(userId: string, photoId: string): Promise<void>;
  restorePhoto(userId: string, photoId: string): Promise<void>;
  setFolderCover(userId: string, folderName: string, photoId: string): Promise<void>;
  listFavorites(userId: string): Promise<FavoriteDoc[]>;
  toggleFavorite(userId: string, photoId: string): Promise<boolean>;
}

const now = () => new Date().toISOString();
const normalizeLogin = (value: string) => value.trim().toLowerCase();
const sanitizeFolder = (value: string) => value.trim().toLowerCase().replace(/[^a-z0-9-_ ]+/g, '').replace(/\s+/g, '-');
const sanitizeUsername = (value: string) => value.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '').slice(0, 24);
const sanitizeFilename = (value: string) => path.basename(value).replace(/[^a-zA-Z0-9._ -]+/g, '').replace(/\s+/g, '-');
const photoDisplayKey = (photo: PhotoDoc) => `${photo.folderName}/${photo.filename}`;
const isDemoUser = (req: AuthedRequest) => req.user.role === 'demo';
const ownerPrefix = (user: AuthUser) => user.role === 'demo' ? 'demo' : `users/${user.id}`;
const publicUser = (user: UserDoc) => ({ id: user._id, name: user.name, username: user.username, email: user.email, role: user.role, avatar: user.avatar, provider: user.provider });
const wantsDemoManagement = (req: Request) => req.headers['x-manage-demo'] === 'true';
const configuredAdminEmail = () => (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
const isInvalidDemoObjectKey = (key: string) => key.startsWith('users/undefined/');
const visibleFolderNamesForOwner = (folders: FolderDoc[], owner: AuthUser) => {
  const names = folders
    .filter(folder => !RESERVED_FOLDERS.has(folder.name.toLowerCase()))
    .filter(folder => owner.role === 'demo' || folder.isUserCreated || !DEFAULT_FOLDERS.includes(folder.name))
    .map(folder => folder.name);
  return Array.from(new Set(names));
};

async function getGalleryOwner(req: Request, store: MetadataStore): Promise<AuthUser> {
  const authUser = (req as AuthedRequest).user;
  if (authUser.role === 'admin' && wantsDemoManagement(req)) {
    const demo = await store.ensureDemoUser();
    await seedDemoPhotosFromLegacyS3(store, demo);
    return { id: demo._id, username: demo.username, name: demo.name, role: 'demo' };
  }
  return authUser;
}

async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = await new Promise<Buffer>((resolve, reject) => {
    crypto.scrypt(password, salt, 64, (err, key) => err ? reject(err) : resolve(key));
  });
  return `scrypt:${salt}:${derived.toString('hex')}`;
}

async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [, salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const derived = await new Promise<Buffer>((resolve, reject) => {
    crypto.scrypt(password, salt, 64, (err, key) => err ? reject(err) : resolve(key));
  });
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), derived);
}

async function generateUniqueUsername(store: MetadataStore, name: string, email: string) {
  const emailBase = email.split('@')[0] || '';
  const base = sanitizeUsername(name) || sanitizeUsername(emailBase) || `user${crypto.randomInt(1000, 9999)}`;
  let candidate = base;
  let suffix = 1;
  while (await store.findUserByUsername(candidate)) {
    suffix += 1;
    candidate = `${base}${suffix}`;
  }
  return candidate;
}

async function verifyGoogleCredential(credential: string) {
  if (!GOOGLE_CLIENT_ID) throw new Error('Google sign-in is not configured.');
  const ticket = await googleOAuthClient.verifyIdToken({
    idToken: credential,
    audience: GOOGLE_CLIENT_ID,
  });
  const payload = ticket.getPayload();
  if (!payload?.sub || !payload.email) throw new Error('Google account could not be verified.');
  if (!payload.email_verified) throw new Error('Please use a verified Google email address.');
  return {
    googleId: payload.sub,
    email: payload.email.toLowerCase(),
    name: payload.name || payload.email.split('@')[0],
    avatar: payload.picture,
    emailVerified: true,
  };
}

class JsonMetadataStore implements MetadataStore {
  private filePath = path.join(process.cwd(), '.cloudgallery-db.json');
  private data: DatabaseShape | null = null;

  private async read(): Promise<DatabaseShape> {
    if (this.data) return this.data;
    try {
      this.data = JSON.parse(await fs.readFile(this.filePath, 'utf8'));
    } catch {
      this.data = { users: [], folders: [], photos: [], favorites: [] };
    }
    return this.data;
  }

  private async write() {
    if (!this.data) return;
    await fs.writeFile(this.filePath, JSON.stringify(this.data, null, 2));
  }

  async ensureSeedData() {
    const db = await this.read();
    const adminUsername = process.env.ADMIN_USERNAME || 'TaShi';
    const adminPassword = process.env.ADMIN_PASSWORD || 'tashi';

    if (!db.users.some(u => u.role === 'admin')) {
      const passwordHash = await hashPassword(adminPassword);
      db.users.push({
        _id: 'admin',
        name: 'CloudGallery Admin',
        email: `${adminUsername.toLowerCase()}@cloudgallery.local`,
        username: adminUsername,
        passwordHash,
        role: 'admin',
        createdAt: now(),
      });
    }

    const adminEmail = configuredAdminEmail();
    if (adminEmail) {
      const existingAdminUser = db.users.find(u => u.email.toLowerCase() === adminEmail);
      if (existingAdminUser) existingAdminUser.role = 'admin';
    }

    if (!db.users.some(u => u.role === 'demo')) {
      db.users.push({
        _id: 'demo',
        name: 'Demo User',
        email: 'demo@cloudgallery.app',
        username: 'demo',
        passwordHash: await hashPassword(crypto.randomBytes(24).toString('hex')),
        role: 'demo',
        createdAt: now(),
      });
    }

    const demo = db.users.find(u => u.role === 'demo' || u.username.toLowerCase() === 'demo');
    if (demo) {
      for (const folder of DEFAULT_FOLDERS) {
        if (!db.folders.some(f => f.userId === demo._id && f.name === folder)) {
          db.folders.push({ _id: crypto.randomUUID(), userId: demo._id, name: folder, createdAt: now() });
        }
      }
    }
    await this.write();
  }

  async createUser(input: CreateUserInput) {
    const db = await this.read();
    const user: UserDoc = {
      _id: crypto.randomUUID(),
      name: input.name,
      email: input.email.toLowerCase(),
      username: input.username,
      passwordHash: input.passwordHash,
      role: input.role || 'user',
      createdAt: now(),
      provider: input.provider || 'local',
      googleId: input.googleId,
      avatar: input.avatar,
      emailVerified: input.emailVerified,
    };
    db.users.push(user);
    await this.write();
    return user;
  }

  async updateUser(user: UserDoc) {
    const db = await this.read();
    const index = db.users.findIndex(u => u._id === user._id);
    if (index !== -1) {
      db.users[index] = user;
      await this.write();
    }
  }

  async findUserByLogin(login: string) {
    const normalized = normalizeLogin(login);
    const db = await this.read();
    return db.users.find(u => u.email.toLowerCase() === normalized || u.username.toLowerCase() === normalized) || null;
  }

  async findUserByEmail(email: string) {
    const db = await this.read();
    return db.users.find(u => u.email.toLowerCase() === normalizeLogin(email)) || null;
  }

  async findUserByUsername(username: string) {
    const db = await this.read();
    return db.users.find(u => u.username.toLowerCase() === normalizeLogin(username)) || null;
  }

  async findUserById(id: string) {
    const db = await this.read();
    return db.users.find(u => u._id === id) || null;
  }

  async ensureDemoUser() {
    const db = await this.read();
    let demo = db.users.find(u => u.username.toLowerCase() === 'demo' || u.role === 'demo') || null;
    if (!demo) {
      demo = {
        _id: 'demo',
        name: 'Demo User',
        email: 'demo@cloudgallery.app',
        username: 'demo',
        passwordHash: await hashPassword(crypto.randomBytes(24).toString('hex')),
        role: 'demo',
        createdAt: now(),
      };
      db.users.push(demo);
    } else {
      demo.name = 'Demo User';
      demo.username = 'demo';
      demo.email = 'demo@cloudgallery.app';
      demo.role = 'demo';
    }
    for (const folder of DEFAULT_FOLDERS) {
      if (!db.folders.some(f => f.userId === demo._id && f.name === folder)) {
        db.folders.push({ _id: crypto.randomUUID(), userId: demo._id, name: folder, createdAt: now() });
      }
    }
    await this.write();
    return demo;
  }

  async listFolders(userId: string) {
    const db = await this.read();
    return db.folders.filter(f => f.userId === userId).sort((a, b) => a.name.localeCompare(b.name));
  }

  async findFolder(userId: string, name: string) {
    const db = await this.read();
    const clean = sanitizeFolder(name);
    return db.folders.find(f => f.userId === userId && f.name === clean) || null;
  }

  async createFolder(userId: string, name: string) {
    const db = await this.read();
    const clean = sanitizeFolder(name);
    const existing = db.folders.find(f => f.userId === userId && f.name === clean);
    if (existing) {
      existing.isUserCreated = true;
      await this.write();
      return existing;
    }
    const folder = { _id: crypto.randomUUID(), userId, name: clean, createdAt: now(), isUserCreated: true };
    db.folders.push(folder);
    await this.write();
    return folder;
  }

  async renameFolder(userId: string, oldName: string, newName: string) {
    const db = await this.read();
    const folder = db.folders.find(f => f.userId === userId && f.name === sanitizeFolder(oldName));
    if (!folder) return null;
    folder.name = sanitizeFolder(newName);
    db.photos.filter(p => p.userId === userId && p.folderId === folder._id).forEach(p => {
      p.folderName = folder.name;
    });
    await this.write();
    return folder;
  }

  async deleteFolder(userId: string, name: string) {
    const db = await this.read();
    const folder = db.folders.find(f => f.userId === userId && f.name === sanitizeFolder(name)) || null;
    const photos = folder ? db.photos.filter(p => p.userId === userId && p.folderId === folder._id) : [];
    if (folder) {
      db.folders = db.folders.filter(f => f._id !== folder._id);
      const photoIds = new Set(photos.map(p => p._id));
      db.photos = db.photos.filter(p => !photoIds.has(p._id));
      db.favorites = db.favorites.filter(f => !photoIds.has(f.photoId));
      await this.write();
    }
    return { folder, photos };
  }

  async deleteFolderOnly(userId: string, name: string) {
    const db = await this.read();
    const folder = db.folders.find(f => f.userId === userId && f.name === sanitizeFolder(name)) || null;
    if (folder) {
      db.folders = db.folders.filter(f => f._id !== folder._id);
      await this.write();
    }
    return folder;
  }

  async listPhotos(userId: string) {
    const db = await this.read();
    return db.photos.filter(p => p.userId === userId && !p.deletedAt).sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
  }

  async listDeletedPhotos(userId: string) {
    const db = await this.read();
    return db.photos.filter(p => p.userId === userId && p.deletedAt).sort((a, b) => (b.deletedAt || '').localeCompare(a.deletedAt || ''));
  }

  async createPhoto(input: Omit<PhotoDoc, '_id' | 'uploadedAt'>) {
    const db = await this.read();
    const photo = { ...input, _id: crypto.randomUUID(), uploadedAt: now() };
    db.photos.push(photo);
    await this.write();
    return photo;
  }

  async findPhotoByDisplayKey(userId: string, key: string) {
    const db = await this.read();
    return db.photos.find(p => p.userId === userId && !p.deletedAt && photoDisplayKey(p) === key) || null;
  }

  async updatePhoto(photo: PhotoDoc) {
    const db = await this.read();
    const index = db.photos.findIndex(p => p._id === photo._id && p.userId === photo.userId);
    if (index !== -1) db.photos[index] = photo;
    await this.write();
  }

  async deletePhoto(userId: string, photoId: string) {
    const db = await this.read();
    db.photos = db.photos.filter(p => !(p.userId === userId && p._id === photoId));
    db.favorites = db.favorites.filter(f => f.photoId !== photoId);
    db.folders.forEach(folder => {
      if (folder.coverPhotoId === photoId) delete folder.coverPhotoId;
    });
    await this.write();
  }

  async restorePhoto(userId: string, photoId: string) {
    const db = await this.read();
    const photo = db.photos.find(p => p.userId === userId && p._id === photoId);
    if (photo) delete photo.deletedAt;
    await this.write();
  }

  async setFolderCover(userId: string, folderName: string, photoId: string) {
    const db = await this.read();
    const folder = db.folders.find(f => f.userId === userId && f.name === sanitizeFolder(folderName));
    if (folder) folder.coverPhotoId = photoId;
    await this.write();
  }

  async listFavorites(userId: string) {
    const db = await this.read();
    return db.favorites.filter(f => f.userId === userId);
  }

  async toggleFavorite(userId: string, photoId: string) {
    const db = await this.read();
    const existing = db.favorites.find(f => f.userId === userId && f.photoId === photoId);
    if (existing) {
      db.favorites = db.favorites.filter(f => f._id !== existing._id);
      await this.write();
      return false;
    }
    db.favorites.push({ _id: crypto.randomUUID(), userId, photoId });
    await this.write();
    return true;
  }
}

class MongoMetadataStore implements MetadataStore {
  private users: any;
  private folders: any;
  private photos: any;
  private favorites: any;

  constructor(db: any) {
    this.users = db.collection('users');
    this.folders = db.collection('folders');
    this.photos = db.collection('photos');
    this.favorites = db.collection('favorites');
  }

  async ensureSeedData() {
    await Promise.all([
      this.users.createIndex({ email: 1 }, { unique: true }),
      this.users.createIndex({ username: 1 }, { unique: true }),
      this.folders.createIndex({ userId: 1, name: 1 }, { unique: true }),
      this.photos.createIndex({ userId: 1, folderId: 1 }),
      this.favorites.createIndex({ userId: 1, photoId: 1 }, { unique: true }),
    ]);
    const adminUsername = process.env.ADMIN_USERNAME || 'TaShi';
    if (!await this.users.findOne({ role: 'admin' })) {
      await this.users.insertOne({
        _id: 'admin',
        name: 'CloudGallery Admin',
        email: `${adminUsername.toLowerCase()}@cloudgallery.local`,
        username: adminUsername,
        passwordHash: await hashPassword(process.env.ADMIN_PASSWORD || 'tashi'),
        role: 'admin',
        createdAt: now(),
      });
    }
    const adminEmail = configuredAdminEmail();
    if (adminEmail) {
      await this.users.updateOne({ email: adminEmail }, { $set: { role: 'admin' } });
    }
    if (!await this.users.findOne({ role: 'demo' })) {
      await this.users.insertOne({
        _id: 'demo',
        name: 'Demo User',
        email: 'demo@cloudgallery.app',
        username: 'demo',
        passwordHash: await hashPassword(crypto.randomBytes(24).toString('hex')),
        role: 'demo',
        createdAt: now(),
      });
    }
    const demo = await this.users.findOne({ $or: [{ role: 'demo' }, { username: 'demo' }] });
    if (demo) {
      for (const folder of DEFAULT_FOLDERS) {
        await this.folders.updateOne(
          { userId: demo._id, name: folder },
          { $setOnInsert: { _id: crypto.randomUUID(), userId: demo._id, name: folder, createdAt: now() } },
          { upsert: true }
        );
      }
    }
  }

  async createUser(input: CreateUserInput) {
    const user: UserDoc = {
      _id: crypto.randomUUID(),
      name: input.name,
      email: input.email.toLowerCase(),
      username: input.username,
      passwordHash: input.passwordHash,
      role: input.role || 'user',
      createdAt: now(),
      provider: input.provider || 'local',
      googleId: input.googleId,
      avatar: input.avatar,
      emailVerified: input.emailVerified,
    };
    await this.users.insertOne(user);
    return user;
  }

  async updateUser(user: UserDoc) {
    await this.users.updateOne({ _id: user._id }, { $set: user });
  }

  async findUserByLogin(login: string) {
    const normalized = normalizeLogin(login);
    return this.users.findOne({ $or: [{ email: normalized }, { username: new RegExp(`^${normalized.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') }] });
  }

  async findUserByEmail(email: string) {
    return this.users.findOne({ email: normalizeLogin(email) });
  }

  async findUserByUsername(username: string) {
    return this.users.findOne({ username: new RegExp(`^${normalizeLogin(username).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') });
  }

  async findUserById(id: string) {
    return this.users.findOne({ _id: id });
  }

  async ensureDemoUser() {
    const existing = await this.users.findOne({ $or: [{ username: 'demo' }, { role: 'demo' }] });
    const demo: UserDoc = existing ? {
      ...existing,
      name: 'Demo User',
      email: 'demo@cloudgallery.app',
      username: 'demo',
      role: 'demo',
    } : {
      _id: 'demo',
      name: 'Demo User',
      email: 'demo@cloudgallery.app',
      username: 'demo',
      passwordHash: await hashPassword(crypto.randomBytes(24).toString('hex')),
      role: 'demo',
      createdAt: now(),
    };

    await this.users.updateOne(
      { _id: demo._id },
      { $set: { name: demo.name, email: demo.email, username: demo.username, role: demo.role }, $setOnInsert: { passwordHash: demo.passwordHash, createdAt: demo.createdAt } },
      { upsert: true }
    );
    for (const folder of DEFAULT_FOLDERS) {
      await this.folders.updateOne(
        { userId: demo._id, name: folder },
        { $setOnInsert: { _id: crypto.randomUUID(), userId: demo._id, name: folder, createdAt: now() } },
        { upsert: true }
      );
    }
    return (await this.findUserById(demo._id))!;
  }

  async listFolders(userId: string) {
    return this.folders.find({ userId }).sort({ name: 1 }).toArray();
  }

  async findFolder(userId: string, name: string) {
    return this.folders.findOne({ userId, name: sanitizeFolder(name) });
  }

  async createFolder(userId: string, name: string) {
    const clean = sanitizeFolder(name);
    const existing = await this.findFolder(userId, clean);
    if (existing) {
      await this.folders.updateOne({ _id: existing._id }, { $set: { isUserCreated: true } });
      return { ...existing, isUserCreated: true };
    }
    const folder = { _id: crypto.randomUUID(), userId, name: clean, createdAt: now(), isUserCreated: true };
    try {
      await this.folders.insertOne(folder);
    } catch (err: any) {
      if (err?.code === 11000) {
        const duplicate = await this.findFolder(userId, clean);
        if (duplicate) {
          await this.folders.updateOne({ _id: duplicate._id }, { $set: { isUserCreated: true } });
          return { ...duplicate, isUserCreated: true };
        }
      }
      throw err;
    }
    return folder;
  }

  async renameFolder(userId: string, oldName: string, newName: string) {
    const folder = await this.findFolder(userId, oldName);
    if (!folder) return null;
    const clean = sanitizeFolder(newName);
    await this.folders.updateOne({ _id: folder._id, userId }, { $set: { name: clean } });
    await this.photos.updateMany({ userId, folderId: folder._id }, { $set: { folderName: clean } });
    return { ...folder, name: clean };
  }

  async deleteFolder(userId: string, name: string) {
    const folder = await this.findFolder(userId, name);
    const photos = folder ? await this.photos.find({ userId, folderId: folder._id }).toArray() : [];
    if (folder) {
      await this.folders.deleteOne({ _id: folder._id, userId });
      const photoIds = photos.map((photo: PhotoDoc) => photo._id);
      await this.photos.deleteMany({ userId, _id: { $in: photoIds } });
      await this.favorites.deleteMany({ userId, photoId: { $in: photoIds } });
    }
    return { folder, photos };
  }

  async deleteFolderOnly(userId: string, name: string) {
    const folder = await this.findFolder(userId, name);
    if (folder) await this.folders.deleteOne({ _id: folder._id, userId });
    return folder;
  }

  async listPhotos(userId: string) {
    return this.photos.find({ userId, deletedAt: { $exists: false } }).sort({ uploadedAt: -1 }).toArray();
  }

  async listDeletedPhotos(userId: string) {
    return this.photos.find({ userId, deletedAt: { $exists: true } }).sort({ deletedAt: -1 }).toArray();
  }

  async createPhoto(input: Omit<PhotoDoc, '_id' | 'uploadedAt'>) {
    const photo = { ...input, _id: crypto.randomUUID(), uploadedAt: now() };
    await this.photos.insertOne(photo);
    return photo;
  }

  async findPhotoByDisplayKey(userId: string, key: string) {
    const [folderName, ...rest] = key.split('/');
    return this.photos.findOne({ userId, folderName, filename: rest.join('/'), deletedAt: { $exists: false } });
  }

  async updatePhoto(photo: PhotoDoc) {
    await this.photos.updateOne({ _id: photo._id, userId: photo.userId }, { $set: photo });
  }

  async deletePhoto(userId: string, photoId: string) {
    await this.photos.deleteOne({ userId, _id: photoId });
    await this.favorites.deleteMany({ userId, photoId });
    await this.folders.updateMany({ userId, coverPhotoId: photoId }, { $unset: { coverPhotoId: '' } });
  }

  async restorePhoto(userId: string, photoId: string) {
    await this.photos.updateOne({ userId, _id: photoId }, { $unset: { deletedAt: '' } });
  }

  async setFolderCover(userId: string, folderName: string, photoId: string) {
    await this.folders.updateOne({ userId, name: sanitizeFolder(folderName) }, { $set: { coverPhotoId: photoId } });
  }

  async listFavorites(userId: string) {
    return this.favorites.find({ userId }).toArray();
  }

  async toggleFavorite(userId: string, photoId: string) {
    const existing = await this.favorites.findOne({ userId, photoId });
    if (existing) {
      await this.favorites.deleteOne({ _id: existing._id });
      return false;
    }
    await this.favorites.insertOne({ _id: crypto.randomUUID(), userId, photoId });
    return true;
  }
}

let storePromise: Promise<MetadataStore> | null = null;

async function getStore(): Promise<MetadataStore> {
  if (storePromise) return storePromise;
  storePromise = (async () => {
    if (process.env.MONGODB_URI) {
      try {
        const importer = new Function('specifier', 'return import(specifier)');
        const { MongoClient } = await importer('mongodb');
        const client = new MongoClient(process.env.MONGODB_URI);
        await client.connect();
        const store = new MongoMetadataStore(client.db(process.env.MONGODB_DB || 'cloudgallery'));
        await store.ensureSeedData();
        console.log('MongoDB connected for CloudGallery metadata.');
        return store;
      } catch (err) {
        console.warn('MongoDB driver/connection unavailable; using local metadata fallback.', err);
      }
    }
    const store = new JsonMetadataStore();
    await store.ensureSeedData();
    return store;
  })();
  return storePromise;
}

function signIn(res: Response, user: UserDoc) {
  const token = jwt.sign({ id: user._id, username: user.username, name: user.name, role: user.role }, JWT_SECRET, { expiresIn: '24h' });
  res.cookie('token', token, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production' });
  return res.json({ message: 'Login successful', token, user: publicUser(user) });
}

const authenticateToken = (req: Request, res: Response, next: NextFunction) => {
  const token = req.cookies.token || req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ message: 'Access denied. No token provided.' });
  try {
    (req as AuthedRequest).user = jwt.verify(token, JWT_SECRET) as AuthUser;
    next();
  } catch {
    res.status(401).json({ message: 'Invalid token' });
  }
};

const blockDemoMutations = (req: Request, res: Response, next: NextFunction) => {
  if (isDemoUser(req as AuthedRequest)) return res.status(403).json({ message: DEMO_MESSAGE });
  next();
};

async function requireBucket(res: Response) {
  if (!BUCKET_NAME) {
    res.status(500).json({ message: 'AWS S3 Bucket Name not configured' });
    return false;
  }
  return true;
}

async function deletePhotoObjects(photo: PhotoDoc) {
  await Promise.all([photo.s3Key, photo.thumbKey, photo.previewKey].map(key =>
    s3Client.send(new DeleteObjectCommand({ Bucket: BUCKET_NAME, Key: key })).catch(() => undefined)
  ));
}

async function seedDemoPhotosFromLegacyS3(store: MetadataStore, demo: UserDoc) {
  if (!BUCKET_NAME) return;

  const allExistingPhotos = await store.listPhotos(demo._id);
  const existingPhotos: PhotoDoc[] = [];
  const seenExistingKeys = new Set<string>();
  for (const photo of allExistingPhotos) {
    if (isInvalidDemoObjectKey(photo.s3Key) || seenExistingKeys.has(photo.s3Key)) {
      await store.deletePhoto(demo._id, photo._id);
      continue;
    }
    seenExistingKeys.add(photo.s3Key);
    existingPhotos.push(photo);
  }
  const existingKeys = new Set(existingPhotos.map(photo => photo.s3Key));
  const allObjects: Array<{ Key?: string; Size?: number; LastModified?: Date }> = [];
  let continuationToken: string | undefined = undefined;

  do {
    const data = await s3Client.send(new ListObjectsV2Command({
      Bucket: BUCKET_NAME,
      ContinuationToken: continuationToken,
    }));
    allObjects.push(...(data.Contents || []));
    continuationToken = data.NextContinuationToken;
  } while (continuationToken);

  const allKeys = new Set(allObjects.map(object => object.Key).filter(Boolean) as string[]);
  const originalPhotos = allObjects.filter(object => {
    const key = object.Key || '';
    const parts = key.split('/');
    const filename = key.split('/').pop() || '';
    if (!key || key.endsWith('/')) return false;
    if (key.includes('/thumbnails/') || key.includes('/previews/')) return false;
    if (isInvalidDemoObjectKey(key)) return false;
    const isNewUserScopedObject = parts[0] === 'users' && parts[1] !== 'undefined' && parts.length >= 4;
    if (isNewUserScopedObject || key.startsWith('demo/') || key.startsWith('.metadata/') || key.startsWith('app-config/')) return false;
    if (key.startsWith('thumbnails/') || key.startsWith('previews/')) return false;
    return /\.(png|jpe?g|gif|webp|avif)$/i.test(filename);
  });

  for (const object of originalPhotos) {
    const key = object.Key!;
    if (existingKeys.has(key)) continue;

    const parts = key.split('/');
    const isRootPhoto = parts.length === 1;
    const isLegacyUndefinedUserPhoto = parts[0] === 'users' && parts[1] === 'undefined';
    const rawFolder = isRootPhoto ? 'other' : parts[0] || 'other';
    const folderName = sanitizeFolder(rawFolder) || 'other';
    const filename = isRootPhoto || isLegacyUndefinedUserPhoto ? parts[parts.length - 1] : parts.slice(1).join('/');
    if (!filename) continue;

    const folder = await store.createFolder(demo._id, folderName);
    const folderThumbKey = `${rawFolder}/thumbnails/${filename}`;
    const rootThumbKey = `thumbnails/${filename}`;
    const folderPreviewKey = `${rawFolder}/previews/${filename}`;
    const rootPreviewKey = `previews/${filename}`;
    const thumbKey = allKeys.has(folderThumbKey) ? folderThumbKey : allKeys.has(rootThumbKey) ? rootThumbKey : key;
    const previewKey = allKeys.has(folderPreviewKey) ? folderPreviewKey : allKeys.has(rootPreviewKey) ? rootPreviewKey : key;

    await store.createPhoto({
      userId: demo._id,
      folderId: folder._id,
      folderName,
      filename,
      s3Key: key,
      thumbKey,
      previewKey,
      size: object.Size || 0,
    });
    existingKeys.add(key);
  }
}

async function seedDemoGalleryForUser(store: MetadataStore, user: AuthUser) {
  if (user.role !== 'demo') return;
  const demo = await store.findUserById(user.id) || await store.ensureDemoUser();
  const existingPhotos = await store.listPhotos(demo._id);
  if (existingPhotos.length >= 23) return;
  await seedDemoPhotosFromLegacyS3(store, demo);
}

async function serializePhoto(photo: PhotoDoc, favoriteIds: Set<string>) {
  const [url, thumbUrl, previewUrl] = await Promise.all([
    getSignedUrl(s3Client, new GetObjectCommand({ Bucket: BUCKET_NAME, Key: photo.s3Key }), { expiresIn: 3600 }),
    getSignedUrl(s3Client, new GetObjectCommand({ Bucket: BUCKET_NAME, Key: photo.thumbKey }), { expiresIn: 3600 }).catch(async () =>
      getSignedUrl(s3Client, new GetObjectCommand({ Bucket: BUCKET_NAME, Key: photo.s3Key }), { expiresIn: 3600 })
    ),
    getSignedUrl(s3Client, new GetObjectCommand({ Bucket: BUCKET_NAME, Key: photo.previewKey }), { expiresIn: 3600 }).catch(async () =>
      getSignedUrl(s3Client, new GetObjectCommand({ Bucket: BUCKET_NAME, Key: photo.s3Key }), { expiresIn: 3600 })
    ),
  ]);
  return {
    key: photoDisplayKey(photo),
    s3Key: photo.s3Key,
    url,
    thumbUrl,
    previewUrl,
    size: photo.size,
    lastModified: photo.uploadedAt,
    isFavorite: favoriteIds.has(photo._id),
  };
}

async function moveOwnedPhoto(user: AuthUser, photo: PhotoDoc, targetFolderName: string, store: MetadataStore) {
  const targetFolder = await store.createFolder(user.id, targetFolderName);
  const prefix = ownerPrefix(user);
  const next = {
    s3Key: `${prefix}/${targetFolder.name}/${photo.filename}`,
    thumbKey: `${prefix}/${targetFolder.name}/thumbnails/${photo.filename}`,
    previewKey: `${prefix}/${targetFolder.name}/previews/${photo.filename}`,
  };
  for (const [src, dest] of [[photo.s3Key, next.s3Key], [photo.thumbKey, next.thumbKey], [photo.previewKey, next.previewKey]]) {
    await s3Client.send(new CopyObjectCommand({ Bucket: BUCKET_NAME, CopySource: encodeURI(`${BUCKET_NAME}/${src}`), Key: dest }));
    await s3Client.send(new DeleteObjectCommand({ Bucket: BUCKET_NAME, Key: src }));
  }
  await store.updatePhoto({ ...photo, folderId: targetFolder._id, folderName: targetFolder.name, ...next });
}

app.get('/api/config-status', (req, res) => {
  const config = {
    awsRegion: !!process.env.AWS_REGION,
    awsAccessKey: !!process.env.AWS_ACCESS_KEY_ID,
    awsSecretKey: !!process.env.AWS_SECRET_ACCESS_KEY,
    awsBucketName: !!process.env.AWS_S3_BUCKET_NAME,
    jwtSecret: !!process.env.JWT_SECRET,
    mongoDb: !!process.env.MONGODB_URI,
    googleClientId: !!GOOGLE_CLIENT_ID,
  };
  res.json({ isConfigured: config.awsRegion && config.awsAccessKey && config.awsSecretKey && config.awsBucketName && config.jwtSecret, config });
});

app.post('/api/register', async (req, res) => {
  try {
    const name = String(req.body.name || '').trim();
    const email = String(req.body.email || '').trim().toLowerCase();
    const username = String(req.body.username || '').trim();
    const password = String(req.body.password || '');
    const confirmPassword = String(req.body.confirmPassword || '');
    if (!name || !email || !username || !password || !confirmPassword) return res.status(400).json({ message: 'All fields are required.' });
    if (password.length < 8) return res.status(400).json({ message: 'Password must be at least 8 characters.' });
    if (password !== confirmPassword) return res.status(400).json({ message: 'Passwords do not match.' });
    const store = await getStore();
    if (await store.findUserByEmail(email)) return res.status(409).json({ message: 'Email is already registered.' });
    if (await store.findUserByUsername(username)) return res.status(409).json({ message: 'Username is already taken.' });
    const user = await store.createUser({ name, email, username, passwordHash: await hashPassword(password) });
    return signIn(res, user);
  } catch (err: any) {
    res.status(500).json({ message: 'Registration failed', error: err.message });
  }
});

app.post('/api/google-auth', async (req, res) => {
  try {
    const credential = String(req.body.credential || '');
    if (!credential) return res.status(400).json({ message: 'Google sign-in failed. Please try again.' });
    const profile = await verifyGoogleCredential(credential);
    const store = await getStore();
    const existing = await store.findUserByEmail(profile.email);
    if (existing) {
      if (existing.role === 'demo') return res.status(403).json({ message: 'Demo account cannot use Google sign-in.' });
      const updatedUser: UserDoc = {
        ...existing,
        name: existing.name || profile.name,
        provider: 'google',
        googleId: profile.googleId,
        avatar: profile.avatar,
        emailVerified: true,
      };
      await store.updateUser(updatedUser);
      return signIn(res, updatedUser);
    }

    const username = await generateUniqueUsername(store, profile.name, profile.email);
    const user = await store.createUser({
      name: profile.name,
      email: profile.email,
      username,
      passwordHash: await hashPassword(crypto.randomBytes(32).toString('hex')),
      role: 'user',
      provider: 'google',
      googleId: profile.googleId,
      avatar: profile.avatar,
      emailVerified: true,
    });
    return signIn(res, user);
  } catch (err: any) {
    res.status(401).json({ message: err.message || 'Google sign-in failed. Please try again.' });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const login = String(req.body.username || req.body.login || '').trim();
    const password = String(req.body.password || '');
    const store = await getStore();
    const user = await store.findUserByLogin(login);
    if (user && user.role !== 'demo' && user.passwordHash && await verifyPassword(password, user.passwordHash)) return signIn(res, user);
    return res.status(401).json({ message: 'Invalid username/email or password.' });
  } catch (err: any) {
    res.status(500).json({ message: 'Login failed', error: err.message });
  }
});

app.post('/api/demo-login', async (req, res) => {
  try {
    const store = await getStore();
    const demo = await store.ensureDemoUser();
    await seedDemoPhotosFromLegacyS3(store, demo);
    return signIn(res, demo);
  } catch (err: any) {
    res.status(500).json({ message: 'Demo login failed', error: err.message });
  }
});

app.get('/api/public/demo-preview', async (req, res) => {
  try {
    if (!await requireBucket(res)) return;
    const store = await getStore();
    const demo = await store.ensureDemoUser();
    await seedDemoPhotosFromLegacyS3(store, demo);
    const [folders, photos, favorites] = await Promise.all([
      store.listFolders(demo._id),
      store.listPhotos(demo._id),
      store.listFavorites(demo._id),
    ]);
    const uniquePhotos = Array.from(new Map(photos.map(photo => [photo.s3Key, photo])).values());
    const favoriteIds = new Set(favorites.map(f => f.photoId));
    const visibleFolders = folders.filter(folder => !RESERVED_FOLDERS.has(folder.name.toLowerCase()));

    res.json({
      folders: visibleFolders.map(folder => folder.name),
      photos: await Promise.all(uniquePhotos.map(photo => serializePhoto(photo, favoriteIds))),
    });
  } catch (err: any) {
    res.status(500).json({ message: 'Error loading demo preview', error: err.message });
  }
});

app.get('/api/me', authenticateToken, async (req, res) => {
  const store = await getStore();
  const user = await store.findUserById((req as AuthedRequest).user.id);
  if (!user) return res.status(401).json({ message: 'User no longer exists.' });
  res.json({ user: publicUser(user) });
});

app.post('/api/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ message: 'Logged out' });
});

app.get('/api/folders', authenticateToken, async (req, res) => {
  const store = await getStore();
  const owner = await getGalleryOwner(req, store);
  await seedDemoGalleryForUser(store, owner);
  const folders = await store.listFolders(owner.id);
  res.json(visibleFolderNamesForOwner(folders, owner));
});

app.get('/api/folders/covers', authenticateToken, async (req, res) => {
  try {
    if (!await requireBucket(res)) return;
    const store = await getStore();
    const owner = await getGalleryOwner(req, store);
    const [folders, photos] = await Promise.all([
      store.listFolders(owner.id),
      store.listPhotos(owner.id),
    ]);
    const photoById = new Map(photos.map(photo => [photo._id, photo]));
    const covers: Record<string, string> = {};
    for (const folder of folders) {
      const cover = folder.coverPhotoId ? photoById.get(folder.coverPhotoId) : undefined;
      if (cover) {
        covers[folder.name] = await getSignedUrl(s3Client, new GetObjectCommand({ Bucket: BUCKET_NAME, Key: cover.thumbKey }), { expiresIn: 3600 });
      }
    }
    res.json(covers);
  } catch (err: any) {
    res.status(500).json({ message: 'Could not load collection covers', error: err.message });
  }
});

app.post('/api/folders', authenticateToken, blockDemoMutations, async (req, res) => {
  try {
    const folder = sanitizeFolder(String(req.body.folder || ''));
    if (!folder || RESERVED_FOLDERS.has(folder)) return res.status(400).json({ message: 'Valid folder name required' });
    const store = await getStore();
    const owner = await getGalleryOwner(req, store);
    await store.createFolder(owner.id, folder);
    const folders = await store.listFolders(owner.id);
    res.json(visibleFolderNamesForOwner(folders, owner));
  } catch (err: any) {
    res.status(500).json({ message: 'Error creating folder', error: err.message });
  }
});

app.delete('/api/folders/:folder', authenticateToken, blockDemoMutations, async (req, res) => {
  try {
    if (!await requireBucket(res)) return;
    const folderName = sanitizeFolder(req.params.folder);
    if (!folderName || RESERVED_FOLDERS.has(folderName)) return res.status(400).json({ message: 'Cannot delete this folder' });
    const mode = String(req.query.mode || 'empty');
    const store = await getStore();
    const owner = await getGalleryOwner(req, store);
    const folder = await store.findFolder(owner.id, folderName);
    if (!folder) return res.status(404).json({ message: 'Folder not found' });
    const photos = (await store.listPhotos(owner.id)).filter(p => p.folderId === folder._id);
    if (photos.length > 0 && mode === 'empty') {
      return res.status(409).json({ message: 'Collection contains photos', photoCount: photos.length });
    }
    if (photos.length > 0 && mode === 'move') {
      for (const photo of photos) {
        await store.updatePhoto({ ...photo, folderId: '', folderName: 'all' });
      }
      await store.deleteFolderOnly(owner.id, folderName);
      return res.json({ message: 'Collection deleted and photos kept in All Photos', photoCount: photos.length });
    }
    if (photos.length > 0 && mode === 'delete') {
      for (const photo of photos) {
        await deletePhotoObjects(photo);
      }
      await store.deleteFolder(owner.id, folderName);
      return res.json({ message: 'Collection and photos deleted', photoCount: photos.length });
    }
    await store.deleteFolderOnly(owner.id, folderName);
    res.json({ message: 'Collection deleted successfully', photoCount: 0 });
  } catch (err: any) {
    res.status(500).json({ message: 'Error deleting folder', error: err.message });
  }
});

app.post('/api/folders/rename', authenticateToken, blockDemoMutations, async (req, res) => {
  try {
    if (!await requireBucket(res)) return;
    const oldName = sanitizeFolder(String(req.body.oldName || ''));
    const newName = sanitizeFolder(String(req.body.newName || ''));
    if (!oldName || !newName || RESERVED_FOLDERS.has(oldName) || RESERVED_FOLDERS.has(newName)) return res.status(400).json({ message: 'Old and new folder names required' });
    const store = await getStore();
    const owner = await getGalleryOwner(req, store);
    const folder = await store.findFolder(owner.id, oldName);
    if (!folder) return res.status(404).json({ message: 'Folder not found' });
    const photos = (await store.listPhotos(owner.id)).filter(p => p.folderId === folder._id);
    for (const photo of photos) {
      const prefix = ownerPrefix(owner);
      const newS3Key = `${prefix}/${newName}/${photo.filename}`;
      const newThumbKey = `${prefix}/${newName}/thumbnails/${photo.filename}`;
      const newPreviewKey = `${prefix}/${newName}/previews/${photo.filename}`;
      for (const [src, dest] of [[photo.s3Key, newS3Key], [photo.thumbKey, newThumbKey], [photo.previewKey, newPreviewKey]]) {
        await s3Client.send(new CopyObjectCommand({ Bucket: BUCKET_NAME, CopySource: encodeURI(`${BUCKET_NAME}/${src}`), Key: dest }));
        await s3Client.send(new DeleteObjectCommand({ Bucket: BUCKET_NAME, Key: src }));
      }
      await store.updatePhoto({ ...photo, folderName: newName, s3Key: newS3Key, thumbKey: newThumbKey, previewKey: newPreviewKey });
    }
    await store.renameFolder(owner.id, oldName, newName);
    res.json({ message: 'Folder renamed successfully' });
  } catch (err: any) {
    res.status(500).json({ message: 'Error renaming folder', error: err.message });
  }
});

app.get('/api/photos', authenticateToken, async (req, res) => {
  try {
    if (!await requireBucket(res)) return;
    const store = await getStore();
    const owner = await getGalleryOwner(req, store);
    await seedDemoGalleryForUser(store, owner);
    const [photos, favorites] = await Promise.all([
      store.listPhotos(owner.id),
      store.listFavorites(owner.id),
    ]);
    const uniquePhotos = Array.from(new Map(photos.map(photo => [photo.s3Key, photo])).values());
    const favoriteIds = new Set(favorites.map(f => f.photoId));
    res.json(await Promise.all(uniquePhotos.map(photo => serializePhoto(photo, favoriteIds))));
  } catch (err: any) {
    res.status(500).json({ message: 'Error fetching photos from S3', error: err.message });
  }
});

app.get('/api/photos/trash', authenticateToken, async (req, res) => {
  try {
    if (!await requireBucket(res)) return;
    const store = await getStore();
    const owner = await getGalleryOwner(req, store);
    const [photos, favorites] = await Promise.all([
      store.listDeletedPhotos(owner.id),
      store.listFavorites(owner.id),
    ]);
    const favoriteIds = new Set(favorites.map(f => f.photoId));
    res.json(await Promise.all(photos.map(photo => serializePhoto(photo, favoriteIds))));
  } catch (err: any) {
    res.status(500).json({ message: 'Could not load trash', error: err.message });
  }
});

app.get('/api/photo-source/:key', authenticateToken, async (req, res) => {
  try {
    if (!await requireBucket(res)) return;
    const key = decodeURIComponent(req.params.key);
    const store = await getStore();
    const owner = await getGalleryOwner(req, store);
    const photo = await store.findPhotoByDisplayKey(owner.id, key);
    if (!photo) return res.status(404).json({ message: 'Photo not found' });
    const object = await s3Client.send(new GetObjectCommand({ Bucket: BUCKET_NAME, Key: photo.s3Key }));
    const bytes = await object.Body?.transformToByteArray();
    if (!bytes) return res.status(404).json({ message: 'Photo not found' });
    res.setHeader('Content-Type', object.ContentType || 'image/jpeg');
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.send(Buffer.from(bytes));
  } catch (err: any) {
    res.status(500).json({ message: 'Could not load photo', error: err.message });
  }
});

app.post('/api/photos/favorite', authenticateToken, blockDemoMutations, async (req, res) => {
  try {
    const key = String(req.body.key || '');
    const store = await getStore();
    const owner = await getGalleryOwner(req, store);
    const photo = await store.findPhotoByDisplayKey(owner.id, key);
    if (!photo) return res.status(404).json({ message: 'Photo not found' });
    const isFavorite = await store.toggleFavorite(owner.id, photo._id);
    res.json({ message: 'Favorite status updated', isFavorite });
  } catch (err: any) {
    res.status(500).json({ message: 'Error updating favorite status', error: err.message });
  }
});

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

app.post('/api/upload', authenticateToken, blockDemoMutations, upload.single('photo'), async (req: Request, res: Response) => {
  try {
    const multerReq = req as AuthedRequest & { file?: Express.Multer.File };
    if (!multerReq.file) return res.status(400).json({ message: 'No file uploaded' });
    if (!await requireBucket(res)) return;
    const store = await getStore();
    const owner = await getGalleryOwner(req, store);
    const folderName = sanitizeFolder(String(req.body.folder || 'other'));
    const folder = await store.createFolder(owner.id, folderName);
    const filename = `${Date.now()}-${sanitizeFilename(multerReq.file.originalname)}`;
    const prefix = ownerPrefix(owner);
    const s3Key = `${prefix}/${folder.name}/${filename}`;
    const thumbKey = `${prefix}/${folder.name}/thumbnails/${filename}`;
    const previewKey = `${prefix}/${folder.name}/previews/${filename}`;
    const [thumbBuffer, previewBuffer] = await Promise.all([
      sharp(multerReq.file.buffer).resize(400, 400, { fit: 'cover' }).toBuffer(),
      sharp(multerReq.file.buffer).resize(1200, 1200, { fit: 'inside', withoutEnlargement: true }).toBuffer(),
    ]);
    const put = (Key: string, Body: Buffer) => s3Client.send(new PutObjectCommand({ Bucket: BUCKET_NAME, Key, Body, ContentType: multerReq.file!.mimetype }));
    await Promise.all([put(s3Key, multerReq.file.buffer), put(thumbKey, thumbBuffer), put(previewKey, previewBuffer)]);
    await store.createPhoto({ userId: owner.id, folderId: folder._id, folderName: folder.name, filename, s3Key, thumbKey, previewKey, size: multerReq.file.size });
    res.json({ message: 'Upload successful', fileName: `${folder.name}/${filename}` });
  } catch (err: any) {
    res.status(500).json({ message: 'Error uploading to S3', error: err.message, code: err.code || err.name, region: process.env.AWS_REGION });
  }
});

app.post('/api/photos/edit-copy', authenticateToken, blockDemoMutations, upload.single('photo'), async (req: Request, res: Response) => {
  try {
    const multerReq = req as AuthedRequest & { file?: Express.Multer.File };
    if (!multerReq.file) return res.status(400).json({ message: 'No file uploaded' });
    if (!await requireBucket(res)) return;

    const originalKey = String(req.body.originalKey || '');
    const store = await getStore();
    const owner = await getGalleryOwner(req, store);
    const original = await store.findPhotoByDisplayKey(owner.id, originalKey);
    if (!original) return res.status(404).json({ message: 'Photo not found' });

    const originalBase = original.filename.replace(/\.[^.]+$/, '');
    const filename = sanitizeFilename(`${originalBase}-edited-${Date.now()}.jpg`);
    const prefix = ownerPrefix(owner);
    const s3Key = `${prefix}/${original.folderName}/${filename}`;
    const thumbKey = `${prefix}/${original.folderName}/thumbnails/${filename}`;
    const previewKey = `${prefix}/${original.folderName}/previews/${filename}`;

    const normalizedBuffer = await sharp(multerReq.file.buffer).jpeg({ quality: 92 }).toBuffer();
    const [thumbBuffer, previewBuffer] = await Promise.all([
      sharp(normalizedBuffer).resize(400, 400, { fit: 'cover' }).toBuffer(),
      sharp(normalizedBuffer).resize(1200, 1200, { fit: 'inside', withoutEnlargement: true }).toBuffer(),
    ]);

    const put = (Key: string, Body: Buffer) => s3Client.send(new PutObjectCommand({ Bucket: BUCKET_NAME, Key, Body, ContentType: 'image/jpeg' }));
    await Promise.all([put(s3Key, normalizedBuffer), put(thumbKey, thumbBuffer), put(previewKey, previewBuffer)]);
    await store.createPhoto({
      userId: owner.id,
      folderId: original.folderId,
      folderName: original.folderName,
      filename,
      s3Key,
      thumbKey,
      previewKey,
      size: normalizedBuffer.length,
      editedFrom: original._id,
      isEditedCopy: true,
    });

    res.json({ message: 'Edited copy saved', fileName: `${original.folderName}/${filename}` });
  } catch (err: any) {
    res.status(500).json({ message: 'Could not save edited photo', error: err.message });
  }
});

app.post('/api/move', authenticateToken, blockDemoMutations, async (req, res) => {
  try {
    if (!await requireBucket(res)) return;
    const sourceKey = String(req.body.sourceKey || '');
    const targetFolderName = sanitizeFolder(String(req.body.targetFolder || ''));
    const store = await getStore();
    const owner = await getGalleryOwner(req, store);
    const photo = await store.findPhotoByDisplayKey(owner.id, sourceKey);
    if (!photo || !targetFolderName) return res.status(404).json({ message: 'Photo or target folder not found' });
    await moveOwnedPhoto(owner, photo, targetFolderName, store);
    res.json({ message: 'Photo moved successfully' });
  } catch (err: any) {
    res.status(500).json({ message: 'Error moving photo in S3', error: err.message, code: err.code || err.name });
  }
});

app.delete('/api/photo/:key', authenticateToken, blockDemoMutations, async (req, res) => {
  try {
    if (!await requireBucket(res)) return;
    const key = decodeURIComponent(req.params.key);
    const store = await getStore();
    const owner = await getGalleryOwner(req, store);
    const photo = await store.findPhotoByDisplayKey(owner.id, key);
    if (!photo) return res.status(404).json({ message: 'Photo not found' });
    await store.updatePhoto({ ...photo, deletedAt: now() });
    res.json({ message: 'Photo deleted successfully' });
  } catch (err: any) {
    res.status(500).json({ message: 'Error deleting from S3', error: err.message, code: err.code || err.name });
  }
});

app.post('/api/photos/bulk-delete', authenticateToken, blockDemoMutations, async (req, res) => {
  try {
    if (!await requireBucket(res)) return;
    const keys = Array.isArray(req.body.keys) ? req.body.keys : [];
    const store = await getStore();
    const owner = await getGalleryOwner(req, store);
    for (const key of keys) {
      const photo = await store.findPhotoByDisplayKey(owner.id, String(key));
      if (photo) {
        await store.updatePhoto({ ...photo, deletedAt: now() });
      }
    }
    res.json({ message: 'Photos deleted successfully' });
  } catch (err: any) {
    res.status(500).json({ message: 'Error deleting photos', error: err.message });
  }
});

app.post('/api/photo/restore', authenticateToken, blockDemoMutations, async (req, res) => {
  try {
    const key = String(req.body.key || '');
    const store = await getStore();
    const owner = await getGalleryOwner(req, store);
    const photo = (await store.listDeletedPhotos(owner.id)).find(p => photoDisplayKey(p) === key);
    if (!photo) return res.status(404).json({ message: 'Photo not found' });
    await store.restorePhoto(owner.id, photo._id);
    res.json({ message: 'Photo restored successfully' });
  } catch (err: any) {
    res.status(500).json({ message: 'Could not restore photo', error: err.message });
  }
});

app.delete('/api/photo/permanent/:key', authenticateToken, blockDemoMutations, async (req, res) => {
  try {
    if (!await requireBucket(res)) return;
    const key = decodeURIComponent(req.params.key);
    const store = await getStore();
    const owner = await getGalleryOwner(req, store);
    const photo = (await store.listDeletedPhotos(owner.id)).find(p => photoDisplayKey(p) === key);
    if (!photo) return res.status(404).json({ message: 'Photo not found' });
    await deletePhotoObjects(photo);
    await store.deletePhoto(owner.id, photo._id);
    res.json({ message: 'Photo permanently deleted' });
  } catch (err: any) {
    res.status(500).json({ message: 'Could not permanently delete photo', error: err.message });
  }
});

app.post('/api/folders/cover', authenticateToken, blockDemoMutations, async (req, res) => {
  try {
    const folderName = sanitizeFolder(String(req.body.folder || ''));
    const key = String(req.body.key || '');
    if (!folderName || RESERVED_FOLDERS.has(folderName) || !key) return res.status(400).json({ message: 'Collection and photo required' });
    const store = await getStore();
    const owner = await getGalleryOwner(req, store);
    const photo = await store.findPhotoByDisplayKey(owner.id, key);
    if (!photo || photo.folderName !== folderName) return res.status(404).json({ message: 'Photo not found in this collection' });
    await store.setFolderCover(owner.id, folderName, photo._id);
    res.json({ message: 'Collection cover updated' });
  } catch (err: any) {
    res.status(500).json({ message: 'Could not update collection cover', error: err.message });
  }
});

app.post('/api/photos/bulk-move', authenticateToken, blockDemoMutations, async (req, res) => {
  try {
    if (!await requireBucket(res)) return;
    const keys = Array.isArray(req.body.keys) ? req.body.keys : [];
    const targetFolderName = sanitizeFolder(String(req.body.targetFolder || ''));
    if (!keys.length || !targetFolderName) return res.status(400).json({ message: 'Keys array and target folder required' });
    const store = await getStore();
    const owner = await getGalleryOwner(req, store);
    let moved = 0;
    for (const sourceKey of keys) {
      const photo = await store.findPhotoByDisplayKey(owner.id, String(sourceKey));
      if (photo) {
        await moveOwnedPhoto(owner, photo, targetFolderName, store);
        moved++;
      }
    }
    res.json({ message: `${moved} photos moved successfully` });
  } catch (err: any) {
    res.status(500).json({ message: 'Error moving photos', error: err.message });
  }
});

app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  console.error('Unhandled Server Error:', err);
  res.status(500).json({ message: 'Internal Server Error', error: err.message, stack: process.env.NODE_ENV !== 'production' ? err.stack : undefined });
});

async function startServer() {
  await getStore();
  if (process.env.NODE_ENV !== 'production') {
    process.env.DISABLE_HMR = 'true';
    const vite = await createViteServer({ server: { middlewareMode: true, hmr: false }, appType: 'spa' });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => res.sendFile(path.join(distPath, 'index.html')));
  }

  const listen = (port: number) => {
    const server = app.listen(port, HOST, () => console.log(`Server running on http://localhost:${port}`));
    server.on('error', (err: NodeJS.ErrnoException) => {
      if (process.env.NODE_ENV !== 'production' && err.code === 'EADDRINUSE') {
        const nextPort = port + 1;
        console.warn(`Port ${port} is already in use; trying http://localhost:${nextPort}`);
        listen(nextPort);
        return;
      }
      throw err;
    });
  };

  listen(PORT);
}

startServer();
