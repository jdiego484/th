import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import Stripe from "stripe";
import admin from "firebase-admin";
import dotenv from "dotenv";
import * as fs from "fs";
import { getFirestore } from "firebase-admin/firestore";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load Firebase config with fallback to env vars
let firebaseConfig: any = {};
try {
  const configPath = path.join(process.cwd(), "firebase-applet-config.json");
  if (fs.existsSync(configPath)) {
    firebaseConfig = JSON.parse(fs.readFileSync(configPath, "utf8"));
  }
} catch (e) {
  console.warn("Could not load firebase-applet-config.json, using environment variables.");
}

const projectId = process.env.VITE_FIREBASE_PROJECT_ID || firebaseConfig.projectId;
const databaseId = process.env.VITE_FIREBASE_DATABASE_ID || firebaseConfig.firestoreDatabaseId;

// Initialize Firebase Admin
if (!admin.apps.length && projectId) {
  try {
    admin.initializeApp({
      projectId: projectId,
    });
  } catch (initError) {
    console.error("Firebase Admin Init Error:", initError);
  }
}
const db = projectId ? getFirestore(admin.app(), databaseId || undefined) : null;

// Initialize Stripe
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "", {
  apiVersion: "2024-06-20",
});

export const app = express();
const PORT = 3000;

app.use(express.json());

// API Routes
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", environment: process.env.VERCEL ? 'vercel' : 'local' });
});

// Stripe Connect: Create Express Account & Onboarding Link
app.post("/api/stripe/onboarding", async (req, res) => {
  try {
    const { uid, email } = req.body;
    if (!uid || !email || !db) {
      return res.status(400).json({ error: "Missing required data or database connection" });
    }

    let privateDoc = await db.collection("users_private").doc(uid).get();
    let stripeAccountId = privateDoc.data()?.stripeAccountId;

    if (!stripeAccountId) {
      const account = await stripe.accounts.create({
        type: "express",
        email: email,
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
      });
      stripeAccountId = account.id;
      await db.collection("users_private").doc(uid).set({ stripeAccountId }, { merge: true });
    }

    const accountLink = await stripe.accountLinks.create({
      account: stripeAccountId,
      refresh_url: `${process.env.APP_URL}/settings?stripe=refresh`,
      return_url: `${process.env.APP_URL}/settings?stripe=success`,
      type: "account_onboarding",
    });

    res.json({ url: accountLink.url });
  } catch (error: any) {
    console.error("Stripe Onboarding Error:", error);
    res.status(500).json({ error: error.message });
  }
});

// Stripe: Create Checkout Session
app.post("/api/stripe/create-checkout", async (req, res) => {
  try {
    const { personalId, studentId, amount, planName } = req.body;
    if (!db) return res.status(500).json({ error: "Database not initialized" });

    const personalPrivateDoc = await db.collection("users_private").doc(personalId).get();
    const stripeAccountId = personalPrivateDoc.data()?.stripeAccountId;

    if (!stripeAccountId) {
      return res.status(400).json({ error: "Personal Trainer has not connected their Stripe account." });
    }

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: [{
        price_data: {
          currency: "brl",
          product_data: { name: planName || "Plano de Treino" },
          unit_amount: amount,
        },
        quantity: 1,
      }],
      mode: "payment",
      success_url: `${process.env.APP_URL}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.APP_URL}/cancel`,
      payment_intent_data: {
        transfer_data: { destination: stripeAccountId },
      },
      metadata: { personalId, studentId },
    });

    res.json({ url: session.url });
  } catch (error: any) {
    console.error("Stripe Checkout Error:", error);
    res.status(500).json({ error: error.message });
  }
});

// Webhook
app.post("/api/stripe/webhook", express.raw({ type: "application/json" }), async (req, res) => {
  const sig = req.headers["stripe-signature"];
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig || "", process.env.STRIPE_WEBHOOK_SECRET || "");
  } catch (err: any) {
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === "account.updated" && db) {
    const account = event.data.object as Stripe.Account;
    if (account.details_submitted && account.charges_enabled) {
      const privateDocs = await db.collection("users_private").where("stripeAccountId", "==", account.id).limit(1).get();
      if (!privateDocs.empty) {
        await db.collection("users_public").doc(privateDocs.docs[0].id).set({ stripeConnected: true }, { merge: true });
      }
    }
  }
  res.json({ received: true });
});

// Vite / Static Files (Only for local development)
if (!process.env.VERCEL) {
  async function setupVite() {
    const distPath = path.join(process.cwd(), 'dist');
    const isProduction = process.env.NODE_ENV === "production";

    if (!isProduction) {
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: "spa",
      });
      app.use(vite.middlewares);
    } else {
      app.use(express.static(distPath));
      app.get("*", (req, res) => {
        res.sendFile(path.join(distPath, "index.html"));
      });
    }
  }
  setupVite();
}

// Global Error Handler
app.use((err: any, req: any, res: any, next: any) => {
  console.error(err);
  res.status(500).json({ error: err.message || "Internal Server Error" });
});

if (!process.env.VERCEL) {
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}
