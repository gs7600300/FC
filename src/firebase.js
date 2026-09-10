import { initializeApp } from 'firebase/app'
import {
  createUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth'
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getFirestore,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
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
export const auth = app ? getAuth(app) : null

export const defaultCategories = ['Food', 'Transport', 'Housing', 'Salary', 'Health', 'Shopping', 'Other']

export function normalizeDate(value) {
  if (!value) {
    return new Date().toISOString().slice(0, 10)
  }

  if (typeof value?.toDate === 'function') {
    return value.toDate().toISOString().slice(0, 10)
  }

  return new Date(value).toISOString().slice(0, 10)
}

export async function signUp(email, password) {
  if (!auth) {
    throw new Error('Firebase is not configured. Add your .env values first.')
  }

  return createUserWithEmailAndPassword(auth, email, password)
}

export async function signIn(email, password) {
  if (!auth) {
    throw new Error('Firebase is not configured. Add your .env values first.')
  }

  return signInWithEmailAndPassword(auth, email, password)
}

export async function signOutUser() {
  if (!auth) {
    throw new Error('Firebase is not configured. Add your .env values first.')
  }

  await signOut(auth)
}

export function subscribeToAuth(onAuthChange) {
  if (!auth) {
    onAuthChange(null)
    return () => {}
  }

  return onAuthStateChanged(auth, onAuthChange)
}

export async function ensureDefaultCategories(uid) {
  if (!db || !uid) {
    return
  }

  const categoriesRef = collection(db, 'categories')
  const categoryQuery = query(categoriesRef, where('uid', '==', uid))
  const snapshot = await import('firebase/firestore').then(({ getDocs }) => getDocs(categoryQuery))

  if (!snapshot.empty) {
    return
  }

  for (const name of defaultCategories) {
    await addDoc(categoriesRef, {
      uid,
      name,
      createdAt: serverTimestamp(),
    })
  }
}

export async function addCategory(uid, name) {
  if (!db || !uid) {
    throw new Error('Для добавления категории нужно войти в аккаунт.')
  }

  const trimmedName = name.trim()
  if (!trimmedName) {
    throw new Error('Название категории не может быть пустым.')
  }

  await addDoc(collection(db, 'categories'), {
    uid,
    name: trimmedName,
    createdAt: serverTimestamp(),
  })
}

export async function updateCategory(id, uid, name) {
  if (!db || !uid) {
    throw new Error('Для изменения категории нужно войти в аккаунт.')
  }

  const trimmedName = name.trim()
  if (!trimmedName) {
    throw new Error('Название категории не может быть пустым.')
  }

  await updateDoc(doc(db, 'categories', id), {
    name: trimmedName,
    updatedAt: serverTimestamp(),
  })
}

export async function deleteCategory(id) {
  if (!db) {
    throw new Error('Firebase is not configured. Add your .env values first.')
  }

  await deleteDoc(doc(db, 'categories', id))
}

export function subscribeToCategories(uid, onUpdate, onError) {
  if (!db || !uid) {
    onUpdate([])
    return () => {}
  }

  const categoriesRef = query(collection(db, 'categories'), where('uid', '==', uid), orderBy('name', 'asc'))

  return onSnapshot(
    categoriesRef,
    (snapshot) => {
      const categories = snapshot.docs.map((doc) => ({
        id: doc.id,
        name: doc.data().name || 'Без названия',
      }))

      onUpdate(categories)
    },
    (error) => {
      console.error('Не удалось загрузить категории.', error)
      onError?.(error)
      onUpdate([])
    },
  )
}

export async function addFamilyMember(uid, name) {
  if (!db || !uid) {
    throw new Error('Для добавления члена семьи нужно войти в аккаунт.')
  }

  const trimmedName = name.trim()
  if (!trimmedName) {
    throw new Error('Имя члена семьи не может быть пустым.')
  }

  await addDoc(collection(db, 'familyMembers'), {
    uid,
    name: trimmedName,
    createdAt: serverTimestamp(),
  })
}

export async function updateFamilyMember(id, uid, name) {
  if (!db || !uid) {
    throw new Error('Для изменения члена семьи нужно войти в аккаунт.')
  }

  const trimmedName = name.trim()
  if (!trimmedName) {
    throw new Error('Имя члена семьи не может быть пустым.')
  }

  await updateDoc(doc(db, 'familyMembers', id), {
    name: trimmedName,
    updatedAt: serverTimestamp(),
  })
}

export async function deleteFamilyMember(id) {
  if (!db) {
    throw new Error('Firebase is not configured. Add your .env values first.')
  }

  await deleteDoc(doc(db, 'familyMembers', id))
}

export function subscribeToFamilyMembers(uid, onUpdate, onError) {
  if (!db || !uid) {
    onUpdate([])
    return () => {}
  }

  const membersRef = query(collection(db, 'familyMembers'), where('uid', '==', uid), orderBy('name', 'asc'))

  return onSnapshot(
    membersRef,
    (snapshot) => {
      const members = snapshot.docs.map((doc) => ({
        id: doc.id,
        name: doc.data().name || 'Без имени',
      }))

      onUpdate(members)
    },
    (error) => {
      console.error('Не удалось загрузить членов семьи.', error)
      onError?.(error)
      onUpdate([])
    },
  )
}

export async function saveTransaction(transaction, uid) {
  if (!db) {
    throw new Error('Firebase is not configured. Add your .env values first.')
  }

  if (!uid) {
    throw new Error('Для сохранения операции нужно войти в аккаунт.')
  }

  await addDoc(collection(db, 'transactions'), {
    uid,
    description: transaction.description.trim(),
    amount: Number(transaction.amount),
    type: transaction.type,
    category: transaction.category,
    familyMemberId: transaction.familyMemberId || null,
    transferToMemberId: transaction.transferToMemberId || null,
    date: transaction.date ? new Date(transaction.date) : new Date(),
    createdAt: serverTimestamp(),
  })
}

export function subscribeToTransactions(uid, onUpdate, onError) {
  if (!db || !uid) {
    onUpdate([])
    return () => {}
  }

  const transactionsRef = query(
    collection(db, 'transactions'),
    where('uid', '==', uid),
    orderBy('date', 'desc'),
  )

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
          familyMemberId: data.familyMemberId || null,
          transferToMemberId: data.transferToMemberId || null,
          date: normalizeDate(data.date),
        }
      })

      onUpdate(transactions)
    },
    (error) => {
      console.error('Не удалось загрузить операции.', error)
      onError?.(error)
      onUpdate([])
    },
  )
}
