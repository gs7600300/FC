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
  getDoc,
  getDocs,
  getFirestore,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
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

function createInviteCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase()
}

async function migrateUserData(uid, familyId) {
  for (const collectionName of ['categories', 'familyMembers', 'transactions']) {
    const snapshot = await getDocs(query(collection(db, collectionName), where('uid', '==', uid)))
    await Promise.all(
      snapshot.docs
        .filter((item) => !item.data().familyId)
        .map((item) => updateDoc(item.ref, { familyId })),
    )
  }
}

export async function ensureFamilyContext(user) {
  if (!db || !user?.uid) {
    throw new Error('Для работы с семьёй нужно войти в аккаунт.')
  }

  const userRef = doc(db, 'users', user.uid)
  const userSnapshot = await getDoc(userRef)
  const profile = userSnapshot.exists() ? userSnapshot.data() : null

  if (profile?.familyId) {
    const familySnapshot = await getDoc(doc(db, 'families', profile.familyId))
    if (familySnapshot.exists()) {
      return { ...profile, familyName: familySnapshot.data().name, inviteCode: familySnapshot.data().inviteCode }
    }
  }

  const familyData = {
    name: `Семья ${user.email?.split('@')[0] || 'пользователя'}`,
    inviteCode: createInviteCode(),
    ownerUid: user.uid,
    createdAt: serverTimestamp(),
  }
  const familyReference = await addDoc(collection(db, 'families'), familyData)
  const memberReference = await addDoc(collection(db, 'familyMembers'), {
    familyId: familyReference.id,
    name: user.email?.split('@')[0] || 'Владелец',
    linkedUserId: user.uid,
    role: 'adult',
    createdAt: serverTimestamp(),
  })
  await setDoc(userRef, {
    familyId: familyReference.id,
    familyMemberId: memberReference.id,
    role: 'owner',
    email: user.email || '',
  })
  await migrateUserData(user.uid, familyReference.id)

  return {
    familyId: familyReference.id,
    familyMemberId: memberReference.id,
    role: 'owner',
    familyName: familyData.name,
    inviteCode: familyData.inviteCode,
  }
}

export async function joinFamily(uid, inviteCode) {
  if (!db || !uid) {
    throw new Error('Для присоединения к семье нужно войти в аккаунт.')
  }

  const snapshot = await getDocs(
    query(collection(db, 'families'), where('inviteCode', '==', inviteCode.trim().toUpperCase())),
  )
  if (snapshot.empty) {
    throw new Error('Семья с таким кодом не найдена.')
  }

  const family = snapshot.docs[0]
  await setDoc(doc(db, 'users', uid), {
    familyId: family.id,
    familyMemberId: '',
    role: 'adult',
  }, { merge: true })

  return { familyId: family.id, familyName: family.data().name, inviteCode: family.data().inviteCode, familyMemberId: '' }
}

export async function linkUserToFamilyMember(memberId, uid) {
  if (!db || !uid || !memberId) {
    throw new Error('Выберите запись члена семьи.')
  }

  await updateDoc(doc(db, 'familyMembers', memberId), { linkedUserId: uid, updatedAt: serverTimestamp() })
  await setDoc(doc(db, 'users', uid), { familyMemberId: memberId }, { merge: true })
}

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

export async function ensureDefaultCategories(familyId) {
  if (!db || !familyId) {
    return
  }

  const categoriesRef = collection(db, 'categories')
  const categoryQuery = query(categoriesRef, where('familyId', '==', familyId))
  const snapshot = await getDocs(categoryQuery)

  if (!snapshot.empty) {
    return
  }

  for (const name of defaultCategories) {
    await addDoc(categoriesRef, {
      familyId,
      name,
      createdAt: serverTimestamp(),
    })
  }
}

export async function addCategory(familyId, name) {
  if (!db || !familyId) {
    throw new Error('Для добавления категории нужно войти в аккаунт.')
  }

  const trimmedName = name.trim()
  if (!trimmedName) {
    throw new Error('Название категории не может быть пустым.')
  }

  await addDoc(collection(db, 'categories'), {
    familyId,
    name: trimmedName,
    createdAt: serverTimestamp(),
  })
}

export async function updateCategory(id, familyId, name) {
  if (!db || !familyId) {
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

export function subscribeToCategories(familyId, onUpdate, onError) {
  if (!db || !familyId) {
    onUpdate([])
    return () => {}
  }

  const categoriesRef = query(collection(db, 'categories'), where('familyId', '==', familyId), orderBy('name', 'asc'))

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

export async function addFamilyMember(familyId, name) {
  if (!db || !familyId) {
    throw new Error('Для добавления члена семьи нужно войти в аккаунт.')
  }

  const trimmedName = name.trim()
  if (!trimmedName) {
    throw new Error('Имя члена семьи не может быть пустым.')
  }

  await addDoc(collection(db, 'familyMembers'), {
    familyId,
    name: trimmedName,
    createdAt: serverTimestamp(),
  })
}

export async function updateFamilyMember(id, familyId, name) {
  if (!db || !familyId) {
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

export function subscribeToFamilyMembers(familyId, onUpdate, onError) {
  if (!db || !familyId) {
    onUpdate([])
    return () => {}
  }

  const membersRef = query(collection(db, 'familyMembers'), where('familyId', '==', familyId), orderBy('name', 'asc'))

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

export async function saveTransaction(transaction, familyId, uid) {
  if (!db) {
    throw new Error('Firebase is not configured. Add your .env values first.')
  }

  if (!familyId) {
    throw new Error('Для сохранения операции нужно войти в аккаунт.')
  }

  await addDoc(collection(db, 'transactions'), {
    uid: uid || null,
    familyId,
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

export async function updateTransaction(id, transaction, familyId) {
  if (!db || !familyId) {
    throw new Error('Для изменения операции нужно войти в аккаунт.')
  }

  await updateDoc(doc(db, 'transactions', id), {
    description: transaction.description.trim(),
    amount: Number(transaction.amount),
    type: transaction.type,
    category: transaction.category,
    familyMemberId: transaction.familyMemberId || null,
    transferToMemberId: transaction.transferToMemberId || null,
    date: transaction.date ? new Date(transaction.date) : new Date(),
    updatedAt: serverTimestamp(),
  })
}

export async function deleteTransaction(id, familyId) {
  if (!db || !familyId) {
    throw new Error('Для удаления операции нужно войти в аккаунт.')
  }

  await deleteDoc(doc(db, 'transactions', id))
}

export function subscribeToTransactions(familyId, onUpdate, onError) {
  if (!db || !familyId) {
    onUpdate([])
    return () => {}
  }

  const transactionsRef = query(
    collection(db, 'transactions'),
    where('familyId', '==', familyId),
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
