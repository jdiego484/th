import { initializeApp, cert, ServiceAccount } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import * as fs from 'fs';
import path from 'path';

// Path to your service account key file
const SERVICE_ACCOUNT_PATH = path.join(process.cwd(), 'service-account.json');

async function migrate() {
  if (!fs.existsSync(SERVICE_ACCOUNT_PATH)) {
    console.error('Error: service-account.json not found.');
    console.error('Please download your service account key from the Firebase Console and place it in the root directory as "service-account.json".');
    process.exit(1);
  }

  const serviceAccount = JSON.parse(fs.readFileSync(SERVICE_ACCOUNT_PATH, 'utf8')) as ServiceAccount;

  initializeApp({
    credential: cert(serviceAccount)
  });

  const db = getFirestore();
  const usersCollection = db.collection('users');
  const publicCollection = db.collection('users_public');
  const privateCollection = db.collection('users_private');
  const emailsCollection = db.collection('user_emails');

  console.log('Starting migration...');

  try {
    const snapshot = await usersCollection.get();
    
    if (snapshot.empty) {
      console.log('No users found in the "users" collection.');
      return;
    }

    console.log(`Found ${snapshot.size} users to process.`);

    let migratedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;

    for (const doc of snapshot.docs) {
      const uid = doc.id;
      const data = doc.data();
      const email = data.email;

      if (!email) {
        console.warn(`Skipping user ${uid}: No email found.`);
        skippedCount++;
        continue;
      }

      // Check if user already exists in users_public
      const publicDoc = await publicCollection.doc(uid).get();
      if (publicDoc.exists) {
        console.log(`Skipping user ${uid}: Already exists in users_public.`);
        skippedCount++;
        continue;
      }

      try {
        const batch = db.batch();

        // 1. Create users_public
        batch.set(publicCollection.doc(uid), {
          name: data.displayName || '',
          city: data.city || '',
          // You might want to add other fields like role if they exist
          role: data.role || 'student' 
        });

        // 2. Create users_private
        batch.set(privateCollection.doc(uid), {
          email: email,
          cpf: data.cpf || '',
          medicalHistory: data.medicalHistory || '',
          medications: data.medications || ''
        });

        // 3. Create user_emails
        // Using email as document ID as requested
        batch.set(emailsCollection.doc(email.toLowerCase()), {
          uid: uid
        });

        await batch.commit();
        migratedCount++;
        console.log(`Successfully migrated user: ${uid} (${email})`);
      } catch (err) {
        console.error(`Error migrating user ${uid}:`, err);
        errorCount++;
      }
    }

    console.log('\nMigration Summary:');
    console.log(`- Total users found: ${snapshot.size}`);
    console.log(`- Successfully migrated: ${migratedCount}`);
    console.log(`- Skipped (already exist or invalid): ${skippedCount}`);
    console.log(`- Errors: ${errorCount}`);

  } catch (error) {
    console.error('Migration failed:', error);
  }
}

migrate();
