# **sEMG Guided Acquisition System**

A guided web interface and session manager for Surface Electromyography (sEMG) data collection built with Next.js, TypeScript, and Prisma.

## **Architecture & Directory Layout**

sEMG/  
├── app/                  \# Next.js App Router (UI pages, protocol prompts, API handlers)  
├── prisma/  
│   └── schema.prisma     \# Relational models for subjects, trials, and session logs  
├── public/               \# Static assets, electrode diagrams, and cue media  
├── proxy.ts              \# Signal acquisition proxy / hardware stream socket relay  
├── prisma.config.ts      \# Prisma runtime config  
├── next.config.ts        \# Next.js framework configuration  
├── package.json          \# Dependencies and scripts  
└── tsconfig.json         \# TypeScript compiler configuration

## **Core Components**

* **Guided Acquisition UI (app/):** Provides timed visual cues and pacing for muscle contraction, hold intervals, and resting baseline states.  
* **Hardware Proxy (proxy.ts):** Acts as a local communication bridge between the EMG acquisition board (serial/Bluetooth/TCP) and the browser client.  
* **Session Persistence (prisma/):** Stores subject records, muscle target configurations, electrode locations, and indexed raw capture references.

## **Tech Stack**

* **Frontend & Backend:** Next.js (App Router)  
* **Language:** TypeScript  
* **Database & ORM:** Prisma ORM (SQLite / PostgreSQL / MySQL)  
* **Styling:** Tailwind CSS  
* **Runtime:** Node.js 18+ or 20+

## **Getting Started**

### **1\. Clone and Install Dependencies**

git clone https://github.com/raygums/sEMG.git  
cd sEMG  
npm install

### **2\. Environment Setup**

Create a .env file in the project root:

\# Database connection string  
DATABASE\_URL="file:./dev.db"

\# Stream proxy configuration  
PROXY\_PORT=8080  
NEXT\_PUBLIC\_STREAM\_URL="ws://localhost:8080"

### **3\. Database Migration**

Generate the Prisma client and sync the schema:

npx prisma db push

*(Optional: Run npx prisma studio to inspect captured subject tables via the web UI).*

### **4\. Running the Development Server**

Start the Next.js web application:

npm run dev

Open [http://localhost:3000](http://localhost:3000) in your browser.

### **5\. Running the Signal Proxy**

If running sensor streaming through proxy.ts, launch it in a separate terminal:

npx tsx proxy.ts

## **Acquisition Workflow**

1. **Register Subject:** Input subject metadata, target muscle groups, and electrode positioning notes.  
2. **Select Protocol:** Choose the trial routine (isometric contraction, dynamic cycle, or baseline rest).  
3. **Execute Recording:** Follow the on-screen pacing prompts (Prepare ![][image1] Contract ![][image1] Rest).  
4. **Save & Export:** Data streams and protocol timestamps are committed to the database and indexed for offline analysis.

## **Author**

* [**raygums**](https://github.com/raygums)

[image1]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABUAAAAZCAYAAADe1WXtAAAAmklEQVR4XmNgGAWjYOCBvLx8FBA7oYtTBOTk5FyAuB/IZESXIxuIioryAF26VEZGRgVdjiIAdKkr0OA16OKUAkagoTlA1wqhS4AAC9DWPKCCWWTg2UD8DYirQeagG0wyUFJS4ldQUFiFLk4JAHm9G2hoOLoE2QBooCIQLwalAnQ5sgHQwGhgPJSji1MEQC4Eep0DXXwUjAIaAQBWzR8e+K55jAAAAABJRU5ErkJggg==>
