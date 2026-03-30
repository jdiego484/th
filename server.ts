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

console.log("Starting server initialization...");

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load Firebase config
console.log("Loading Firebase config from:", path.join(__dirname, "firebase-applet-config.json"));
const firebaseConfig = JSON.parse(fs.readFileSync(path.join(__dirname, "firebase-applet-config.json"), "utf8"));
console.log("Firebase config loaded for project:", firebaseConfig.projectId);

// Initialize Firebase Admin
if (!admin.apps.length) {
  console.log("Initializing Firebase Admin...");
  try {
    // In AI Studio/Cloud Run, initializeApp() with no arguments 
    // is often more reliable as it picks up ambient credentials.
    // We fall back to the config if needed.
    admin.initializeApp({
      projectId: process.env.GOOGLE_CLOUD_PROJECT || firebaseConfig.projectId,
    });
    console.log("Firebase Admin initialized successfully.");
  } catch (initError) {
    console.error("Error initializing Firebase Admin with default credentials, trying with config:", initError);
    admin.initializeApp({
      projectId: firebaseConfig.projectId,
    });
  }
}
const db = getFirestore(admin.app(), firebaseConfig.firestoreDatabaseId || undefined);
console.log("Firestore initialized with database:", firebaseConfig.firestoreDatabaseId || "(default)");

// Initialize Stripe
console.log("Initializing Stripe...");
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "", {
  apiVersion: "2024-06-20",
});
console.log("Stripe initialized.");

async function startServer() {
  console.log("Starting Express server...");
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Stripe Connect: Create Express Account & Onboarding Link
  app.post("/api/stripe/onboarding", async (req, res) => {
    try {
      console.log("Stripe Onboarding Request Body:", req.body);
      const { uid, email } = req.body;

      if (!uid || !email) {
        console.warn("Missing UID or Email in request:", { uid, email });
        return res.status(400).json({ error: "UID and Email are required" });
      }

      // 1. Check if user already has a Stripe account
      console.log(`Checking Firestore for user ${uid} in database ${firebaseConfig.firestoreDatabaseId || '(default)'}`);
      let privateDoc;
      try {
        privateDoc = await db.collection("users_private").doc(uid).get();
      } catch (fsError: any) {
        console.error("Firestore Read Error (users_private):", fsError);
        throw new Error(`Erro ao acessar o banco de dados: ${fsError.message}`);
      }
      
      let stripeAccountId = privateDoc.data()?.stripeAccountId;

      if (!stripeAccountId) {
        // 2. Create the Stripe Connect Account (Express)
        const account = await stripe.accounts.create({
          type: "express",
          email: email,
          capabilities: {
            card_payments: { requested: true },
            transfers: { requested: true },
          },
          settings: {
            payouts: {
              schedule: {
                interval: "manual",
              },
            },
          },
        });
        stripeAccountId = account.id;

        // 3. Save to Firestore
        console.log(`Saving Stripe Account ID ${stripeAccountId} for user ${uid}`);
        try {
          await db.collection("users_private").doc(uid).set({
            stripeAccountId: stripeAccountId
          }, { merge: true });
        } catch (fsWriteError: any) {
          console.error("Firestore Write Error (users_private):", fsWriteError);
          throw new Error(`Erro ao salvar dados no banco: ${fsWriteError.message}`);
        }
      }

      // 4. Generate Onboarding Link
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

  // Stripe: Create Checkout Session (Split Payment)
  app.post("/api/stripe/create-checkout", async (req, res) => {
    try {
      const { personalId, studentId, amount, planName } = req.body;

      // 1. Get Personal's Stripe Account ID
      console.log(`Checking Firestore for personal ${personalId} in database ${firebaseConfig.firestoreDatabaseId || '(default)'}`);
      let personalPrivateDoc;
      try {
        personalPrivateDoc = await db.collection("users_private").doc(personalId).get();
      } catch (fsError: any) {
        console.error("Firestore Read Error (checkout - users_private):", fsError);
        throw new Error(`Erro ao acessar o banco de dados: ${fsError.message}`);
      }
      
      const stripeAccountId = personalPrivateDoc.data()?.stripeAccountId;

      if (!stripeAccountId) {
        return res.status(400).json({ error: "Personal Trainer has not connected their Stripe account." });
      }

      // 2. Create Checkout Session
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ["card"],
        line_items: [
          {
            price_data: {
              currency: "brl",
              product_data: {
                name: planName || "Plano de Treino",
              },
              unit_amount: amount, // in cents
            },
            quantity: 1,
          },
        ],
        mode: "payment",
        success_url: `${process.env.APP_URL}/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${process.env.APP_URL}/cancel`,
        payment_intent_data: {
          transfer_data: {
            destination: stripeAccountId,
          },
          // NO application_fee_amount here as requested (0% platform fee)
        },
        metadata: {
          personalId,
          studentId,
        },
      });

      res.json({ url: session.url });
    } catch (error: any) {
      console.error("Stripe Checkout Error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/stripe/webhook", express.raw({ type: "application/json" }), async (req, res) => {
    const sig = req.headers["stripe-signature"];

    let event;

    try {
      event = stripe.webhooks.constructEvent(
        req.body,
        sig || "",
        process.env.STRIPE_WEBHOOK_SECRET || ""
      );
    } catch (err: any) {
      console.error(`Webhook Error: ${err.message}`);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    // Handle the event
    switch (event.type) {
      case "account.updated":
        const account = event.data.object as Stripe.Account;
        if (account.details_submitted && account.charges_enabled) {
          // Find the user with this stripeAccountId
          const privateDocs = await db.collection("users_private")
            .where("stripeAccountId", "==", account.id)
            .limit(1)
            .get();

          if (!privateDocs.empty) {
            const uid = privateDocs.docs[0].id;
            await db.collection("users_public").doc(uid).set({
              stripeConnected: true
            }, { merge: true });
          }
        }
        break;
      case "checkout.session.completed":
        const session = event.data.object as Stripe.Checkout.Session;
        // Handle successful payment (e.g., update student subscription status)
        console.log("Payment successful for session:", session.id);
        break;
      default:
        console.log(`Unhandled event type ${event.type}`);
    }

    res.json({ received: true });
  });

  // Vite middleware for development
  const distPath = path.join(process.cwd(), 'dist');
  const isProduction = process.env.NODE_ENV === "production" && fs.existsSync(distPath);

  console.log(`Server: NODE_ENV=${process.env.NODE_ENV}, isProduction=${isProduction}, distPath=${distPath}`);

  if (!isProduction) {
    console.log("Vite: Initializing Vite middleware (Development Mode)...");
    try {
      const vite = await createViteServer({
        server: { 
          middlewareMode: true,
          hmr: process.env.DISABLE_HMR !== 'true'
        },
        appType: "spa",
      });
      app.use(vite.middlewares);
      console.log("Vite middleware attached successfully.");
    } catch (viteError) {
      console.error("Failed to initialize Vite:", viteError);
    }
  } else {
    console.log("Vite: Serving static files from dist/ (Production Mode)...");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  // Global error handler
  app.use((err: any, req: any, res: any, next: any) => {
    console.error("Global Error Handler:", err);
    res.status(500).json({ error: err.message || "Internal Server Error" });
  });

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`>>> SERVER IS LISTENING ON PORT ${PORT} <<<`);
    console.log(`>>> ACCESS AT http://0.0.0.0:${PORT} <<<`);
  });
}

startServer();
