# Reliora

Reliora is a full-stack photo gallery for storing, organizing, editing, and revisiting personal image collections. It uses a React frontend, an Express backend, MongoDB for gallery records, and AWS S3 for private image storage.

## Features

- Email/password authentication with JWT sessions
- Google sign-in for new and existing users
- Demo mode for read-only exploration
- Private photo uploads and secure image viewing
- Collections, favorites, recent photos, and trash views
- Photo preview, selection, moving, deletion, and basic editing
- Admin access for managing the demo gallery

## Tech Stack

- React, TypeScript, Vite, and Tailwind CSS
- Node.js and Express
- MongoDB Atlas
- AWS S3
- Google OAuth

## Local Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create a local environment file:

   ```bash
   cp .env.example .env
   ```

3. Fill in the required values in `.env`:

   ```bash
   AWS_ACCESS_KEY_ID=
   AWS_SECRET_ACCESS_KEY=
   AWS_REGION=
   AWS_S3_BUCKET_NAME=
   MONGODB_URI=
   MONGODB_DB=
   JWT_SECRET=
   GOOGLE_CLIENT_ID=
   GOOGLE_CLIENT_SECRET=
   VITE_GOOGLE_CLIENT_ID=
   ```

4. Start the development server:

   ```bash
   npm run dev
   ```

The app runs locally at `http://localhost:3000` unless another port is configured by the runtime.

## Build

Create a production build with:

```bash
npm run build
```

## Deployment Notes

Keep `.env` out of source control. Configure production environment variables through your hosting provider and make sure your Google OAuth client includes the deployed origin.
