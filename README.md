# Reliora

A modern cloud-based photo gallery designed to help users organize, preserve, and revisit their most meaningful memories.

Reliora provides secure photo storage, custom collections, favorites management, and seamless cloud access through an elegant and responsive interface.

---

## Overview

Reliora is a full-stack web application that allows users to upload, organize, and manage their personal photo collections. Images are stored securely in AWS S3 while metadata and user information are maintained in MongoDB.

The platform supports traditional authentication, Google Sign-In, custom collections, favorites, and a dedicated demo mode for visitors.

---

## Features

### Authentication

* Email and password registration
* Secure JWT-based authentication
* Google OAuth Sign-In
* Protected user sessions

### Photo Management

* Upload photos to cloud storage
* View and organize personal galleries
* Create and manage collections
* Mark photos as favorites
* Move photos between collections
* Soft-delete and restore functionality

### User Experience

* Responsive modern UI
* Dark themed interface
* Real-time gallery updates
* Demo mode for exploration
* Search and filtering support

---

## Tech Stack

### Frontend

* React
* TypeScript
* Vite
* Tailwind CSS

### Backend

* Node.js
* Express.js

### Database

* MongoDB Atlas

### Cloud Storage

* AWS S3

### Authentication

* JWT
* Google OAuth 2.0

---

## Project Structure

```text
Reliora/
│
├── src/
│   ├── components/
│   ├── hooks/
│   ├── lib/
│   ├── pages/
│   ├── App.tsx
│   ├── main.tsx
│   └── index.css
│
├── dist/
│
├── server.ts
├── vite.config.ts
├── package.json
├── tsconfig.json
├── metadata.json
├── .env.example
└── README.md
```

---

## Environment Variables

Create a `.env` file in the root directory.

```env
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

---

## Local Development

Install dependencies:

```bash
npm install
```

Create environment variables:

```bash
cp .env.example .env
```

Start the development server:

```bash
npm run dev
```

The application will be available at:

```text
http://localhost:3001
```

---

## Production Build

Generate an optimized production build:

```bash
npm run build
```

Preview the build locally:

```bash
npm run preview
```

---

## Deployment

Reliora can be deployed using:

* Vercel (Frontend)
* Render (Backend)
* MongoDB Atlas (Database)
* AWS S3 (Image Storage)

Make sure all production environment variables are configured within your hosting platform before deployment.

---

## Future Improvements

* Shared albums
* AI-powered photo search
* Photo tagging and categorization
* Collaborative collections
* Mobile application support

---

## License

This project was developed for educational and portfolio purposes.
