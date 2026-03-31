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

const projectId = firebaseConfig.projectId || process.env.VITE_FIREBASE_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT;
const databaseId = firebaseConfig.firestoreDatabaseId || process.env.VITE_FIREBASE_DATABASE_ID;

// Initialize Firebase Admin
let finalProjectId = projectId;

if (!admin.apps.length) {
  try {
    const serviceAccountVar = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (serviceAccountVar) {
      const serviceAccount = JSON.parse(serviceAccountVar);
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        projectId: serviceAccount.project_id,
        databaseURL: `https://${serviceAccount.project_id}.firebaseio.com`
      });
      finalProjectId = serviceAccount.project_id;
      console.log("✅ Using Service Account from environment variable. Project ID:", finalProjectId);
    } else if (finalProjectId) {
      admin.initializeApp({
        credential: admin.credential.applicationDefault(),
        projectId: finalProjectId
      });
      console.log("✅ Firebase Admin initialized with Application Default Credentials for project:", finalProjectId);
    }
  } catch (initError) {
    console.error("❌ Firebase Admin Init Error:", initError);
  }
}

let db: any = null;
if (admin.apps.length > 0) {
  try {
    // Use the default database
    db = getFirestore(admin.app());
    console.log(`✅ Firestore initialized with default database in project: ${finalProjectId}`);
  } catch (dbError) {
    console.error("❌ Firestore Init Error:", dbError);
  }
}

// Initialize Stripe
const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
const appUrl = process.env.APP_URL?.replace(/\/$/, ""); // Remove trailing slash if present

console.log("--- Backend Configuration ---");
console.log("APP_URL:", appUrl || "MISSING");
console.log("STRIPE_SECRET_KEY:", stripeSecretKey ? "PRESENT (masked)" : "MISSING");
console.log("FIREBASE_PROJECT_ID:", projectId || "MISSING");
console.log("FIREBASE_DATABASE_ID:", databaseId || "DEFAULT");
console.log("NODE_ENV:", process.env.NODE_ENV || "not set");
console.log("-----------------------------");

// Initialize Stripe with the secret key from environment variables
let stripe: Stripe;
try {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    console.warn("⚠️ STRIPE_SECRET_KEY is not set. Stripe functionality will be limited.");
  }
  stripe = new Stripe(secretKey || "");
  console.log("✅ Stripe initialized successfully.");
} catch (stripeInitError) {
  console.error("❌ Stripe Initialization Error:", stripeInitError);
  stripe = new Stripe("dummy_key");
}

export const app = express();
const PORT = 3000;

app.use(express.json());

// API Routes
app.get("/api/health", async (req, res) => {
  let firestoreStatus = "not_initialized";
  
  if (db) {
    try {
      // Use a shorter timeout for health check to prevent hanging
      const healthCheckPromise = db.collection("health_check").limit(1).get();
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error("Timeout")), 5000)
      );
      
      await Promise.race([healthCheckPromise, timeoutPromise]);
      firestoreStatus = "connected";
    } catch (e: any) {
      console.error("[Health Check] Firestore Error:", e.message);
      firestoreStatus = `error: ${e.message}`;
    }
  }

  res.json({ 
    status: "ok", 
    environment: process.env.NODE_ENV || 'development',
    platform: process.env.VERCEL ? 'vercel' : 'cloud_run',
    config: {
      hasStripeKey: !!stripeSecretKey,
      hasAppUrl: !!appUrl,
      appUrl: appUrl,
      hasFirebaseProjectId: !!projectId,
      projectId: admin.app().options.projectId,
      googleCloudProject: process.env.GOOGLE_CLOUD_PROJECT,
      databaseId: databaseId,
      firestoreStatus: firestoreStatus
    }
  });
});

// Stripe Connect: Create Express Account & Onboarding Link
app.post("/api/stripe/onboarding", async (req, res) => {
  try {
    const { uid, email } = req.body;
    console.log(`[Stripe Onboarding] Request received - UID: ${uid}, Email: ${email}`);

    if (!stripeSecretKey) {
      console.error("[Stripe Onboarding] Error: STRIPE_SECRET_KEY is missing");
      return res.status(500).json({ error: "Configuração do Stripe incompleta (STRIPE_SECRET_KEY ausente)." });
    }

    if (!appUrl) {
      console.error("[Stripe Onboarding] Error: APP_URL is missing");
      return res.status(500).json({ error: "Configuração do servidor incompleta (APP_URL ausente)." });
    }

    if (!uid || !email) {
      console.error("[Stripe Onboarding] Error: Missing uid or email", { uid, email });
      return res.status(400).json({ error: "UID e Email são obrigatórios." });
    }

    if (!db) {
      console.error("[Stripe Onboarding] Error: Firestore not initialized");
      return res.status(500).json({ error: "Conexão com o banco de dados (Firestore) não inicializada." });
    }

    let stripeAccountId: string | undefined;

    try {
      console.log(`[Stripe Onboarding] Step 1: Fetching private doc for UID: ${uid}`);
      const privateDoc = await db.collection("users_private").doc(uid).get();
      console.log(`[Stripe Onboarding] Step 1 Success: Doc exists? ${privateDoc.exists}`);
      stripeAccountId = privateDoc.data()?.stripeAccountId;
    } catch (dbError: any) {
      console.error("[Stripe Onboarding] Step 1 Failure (Firestore Fetch):", dbError);
      return res.status(500).json({ error: `Erro ao acessar o banco de dados: ${dbError.message}` });
    }

    if (!stripeAccountId) {
      console.log(`[Stripe Onboarding] Step 2: Creating new Stripe Express account for ${email}`);
      try {
        const account = await stripe.accounts.create({
          type: "express",
          email: email,
          capabilities: {
            card_payments: { requested: true },
            transfers: { requested: true },
          },
        });
        stripeAccountId = account.id;
        console.log(`[Stripe Onboarding] Step 2 Success: New account created: ${stripeAccountId}`);
        
        console.log(`[Stripe Onboarding] Step 3: Saving account ID to Firestore for UID: ${uid}`);
        await db.collection("users_private").doc(uid).set({ stripeAccountId }, { merge: true });
        console.log(`[Stripe Onboarding] Step 3 Success: Account ID saved.`);
      } catch (stripeError: any) {
        console.error("[Stripe Onboarding] Step 2/3 Failure (Stripe Account Creation/Saving):", stripeError);
        return res.status(500).json({ error: `Erro ao criar conta no Stripe: ${stripeError.message}` });
      }
    } else {
      console.log(`[Stripe Onboarding] Step 2 Skip: Using existing account: ${stripeAccountId}`);
    }

    console.log(`[Stripe Onboarding] Step 4: Generating account link for ${stripeAccountId}`);
    try {
      const accountLink = await stripe.accountLinks.create({
        account: stripeAccountId,
        refresh_url: `${appUrl}/settings?stripe=refresh`,
        return_url: `${appUrl}/settings?stripe=success`,
        type: "account_onboarding",
      });

      console.log(`[Stripe Onboarding] Step 4 Success: Link generated`);
      return res.json({ url: accountLink.url });
    } catch (linkError: any) {
      console.error("[Stripe Onboarding] Step 4 Failure (Stripe Link Creation):", linkError);
      return res.status(500).json({ error: `Erro ao gerar link do Stripe: ${linkError.message}` });
    }
  } catch (globalError: any) {
    console.error("[Stripe Onboarding] CRITICAL UNHANDLED ERROR:", globalError);
    return res.status(500).json({ 
      error: "Erro interno crítico no servidor.",
      details: globalError.message
    });
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
    try {
      const distPath = path.join(process.cwd(), 'dist');
      const isProduction = process.env.NODE_ENV === "production";

      if (!isProduction) {
        console.log("🚀 Starting Vite in development mode...");
        const vite = await createViteServer({
          server: { middlewareMode: true },
          appType: "spa",
        });
        app.use(vite.middlewares);
        console.log("✅ Vite middleware attached.");
      } else {
        console.log("📦 Serving static files from dist...");
        app.use(express.static(distPath));
        app.get("*", (req, res) => {
          res.sendFile(path.join(distPath, "index.html"));
        });
      }
    } catch (viteError) {
      console.error("❌ Vite Setup Error:", viteError);
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
