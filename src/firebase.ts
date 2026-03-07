import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyAjVCi3TqI3aAL0hZXlU5lb7Z8LVG0CtmA",
  authDomain: "aplicativoteste-daa4d.firebaseapp.com",
  projectId: "aplicativoteste-daa4d",
  storageBucket: "aplicativoteste-daa4d.firebasestorage.app",
  messagingSenderId: "217785723644",
  appId: "1:217785723644:web:11eeeea2bc8b4291170579"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
