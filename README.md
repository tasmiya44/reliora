# Cloud Photo Gallery with AWS S3

A full-stack cloud computing mini-project demonstrating the integration of a React frontend, Node.js backend, and AWS S3 for scalable image storage.

## 🚀 Project Architecture

1.  **Frontend (React):** A modern, responsive UI built with Vite, Tailwind CSS, and Lucide icons. It handles user authentication state, file selection, and displays images fetched from the backend.
2.  **Backend (Node.js/Express):** A RESTful API that manages registration, login, demo sessions, JWT authentication, folder/photo metadata, favorites, uploads, and ownership checks.
3.  **MongoDB Metadata:** Stores users, folder metadata, photo metadata, favorites, and authentication data. If `MONGODB_URI` is not configured during local development, the app uses `.cloudgallery-db.json` as a fallback metadata store.
4.  **Cloud Storage (AWS S3):** Stores the actual image files. The backend generates **Presigned URLs** to allow the frontend to securely display private S3 objects without making the bucket public.
4.  **Security (IAM & JWT):**
    *   **JWT:** Secures API endpoints so only logged-in users can upload or delete photos.
    *   **IAM:** Uses Access Keys to grant the backend specific permissions (PutObject, GetObject, ListBucket, DeleteObject) on the S3 bucket.

## 🛠️ AWS Setup Guide

1.  **Create S3 Bucket:**
    *   Go to S3 Console -> "Create bucket".
    *   Name it (e.g., `my-cloud-gallery-2024`).
    *   Keep "Block all public access" **ON** (we use presigned URLs for security).
2.  **Create IAM User:**
    *   Go to IAM Console -> "Users" -> "Create user".
    *   Name it `gallery-app-user`.
    *   Attach policies directly: `AmazonS3FullAccess` (or create a custom policy restricted to your bucket).
3.  **Generate Access Keys:**
    *   Select the user -> "Security credentials" -> "Create access key".
    *   Choose "Local code" and save the **Access Key ID** and **Secret Access Key**.
4.  **Configure Environment:**
    *   Copy `.env.example` to `.env`.
    *   Fill in your AWS credentials and bucket name.

## 💻 Local Setup

1.  **Install Dependencies:**
    ```bash
    npm install
    ```
2.  **Configure Environment Variables:**
    Create a `.env` file based on `.env.example`. Set `MONGODB_URI` and `MONGODB_DB` for production-style multi-user metadata storage.
3.  **Run Development Server:**
    ```bash
    npm run dev
    ```
    The app will be available at `http://localhost:3000`.

## 🧪 Testing the Project

1.  **Login/Register/Demo:** Use the seeded admin credentials from `.env`, create a new account, or click **Try Demo**.
2.  **Upload:** Registered users can select an image from the computer. It will be sent to the Express server, uploaded to S3 under `users/{userId}/{folder}/{filename}`, and recorded in metadata.
3.  **View:** The gallery refreshes with user-specific photos using secure presigned URLs.
4.  **Demo Mode:** Demo users can browse, preview, search, and view favorites, but upload/delete/folder management controls are disabled.
5.  **Delete:** Click the trash icon to remove the image from both metadata and S3.

## 🎓 Viva/Presentation Points

*   **Scalability:** AWS S3 provides virtually unlimited storage, making it superior to local server storage.
*   **Security:** Explain how **Presigned URLs** work—they provide temporary access to private objects, ensuring images aren't exposed to the public internet.
*   **Decoupling:** The frontend and backend are separate, allowing for independent scaling and maintenance.
*   **Future Improvements:** Mention adding **AWS CloudFront** for faster global delivery (CDN) or **AWS Lambda** for automatic image resizing on upload.
