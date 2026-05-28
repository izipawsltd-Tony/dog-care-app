import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyDkuFELIQkFZrueleABZA71vgNCp7f4gmM",
  authDomain: "daily-dog-care.firebaseapp.com",
  projectId: "daily-dog-care",
  storageBucket: "daily-dog-care.firebasestorage.app",
  messagingSenderId: "599760842350",
  appId: "1:599760842350:web:281d8637efc0febd52007f",
  measurementId: "G-NM06XPLEG9"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);