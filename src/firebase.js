import { initializeApp } from 'firebase/app'
import {
  addDoc,
  collection,
  getFirestore,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
} from 'firebase/firestore'

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY ?? '',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN ?? '',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID ?? '',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET ?? '',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID ?? '',
  appId: import.meta.env.VITE_FIREBASE_APP_ID ?? '',
}

const hasFirebaseConfig = Object.values(firebaseConfig).every(Boolean)

export const firebaseReady = hasFirebaseConfig

export const app = hasFirebaseConfig ? initializeApp(firebaseConfig) : null
export const db = app ? getFirestore(app) : null

export function normalizeDate(value) {
  if (!value) {
    return new Date().toISOString().slice(0, 10)
  }

  if (typeof value?.toDate === 'function') {
    return value.toDate().toISOString().slice(0, 10)
  }

  return new Date(value).toISOString().slice(0, 10)
}

export async function saveTransaction(transaction) {
  if (!db) {
    throw new Error('Firebase is not configured. Add your .env values first.')
  }

  await addDoc(collection(db, 'transactions'), {
    description: transaction.description.trim(),
    amount: Number(transaction.amount),
    type: transaction.type,
    category: transaction.category,
    date: transaction.date ? new Date(transaction.date) : new Date(),
    createdAt: serverTimestamp(),
  })
}

export function subscribeToTransactions(onUpdate) {
  if (!db) {
    onUpdate([])
    return () => {}
  }

  const transactionsRef = query(collection(db, 'transactions'), orderBy('date', 'desc'))

  return onSnapshot(
    transactionsRef,
    (snapshot) => {
      const transactions = snapshot.docs.map((doc) => {
        const data = doc.data()

        return {
          id: doc.id,
          description: data.description,
          amount: Number(data.amount) || 0,
          type: data.type || 'expense',
          category: data.category || 'Other',
          date: normalizeDate(data.date),
        }
      })

      onUpdate(transactions)
    },
    () => {
      onUpdate([])
    },
  )
}
