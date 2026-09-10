import { useEffect, useMemo, useState } from 'react'
import './App.css'
import {
  addCategory,
  addFamilyMember,
  deleteCategory,
  deleteFamilyMember,
  ensureDefaultCategories,
  firebaseReady,
  saveTransaction,
  signIn,
  signOutUser,
  signUp,
  subscribeToAuth,
  subscribeToCategories,
  subscribeToFamilyMembers,
  subscribeToTransactions,
  updateCategory,
  updateFamilyMember,
} from './firebase'

const initialForm = {
  description: '',
  amount: '',
  category: 'Food',
  familyMemberId: '',
  date: new Date().toISOString().slice(0, 10),
}

const initialIncomeForm = {
  description: 'Зарплата',
  amount: '',
  familyMemberId: '',
  date: new Date().toISOString().slice(0, 10),
}

const initialTransferForm = {
  description: 'Передача остатка',
  amount: '',
  familyMemberId: '',
  transferToMemberId: '',
  date: new Date().toISOString().slice(0, 10),
}

const initialAuthForm = {
  email: '',
  password: '',
}

const initialReportForm = {
  startDate: '',
  endDate: '',
  type: 'all',
  category: 'all',
  member: 'all',
}

const getPreferredTheme = () => {
  if (typeof window === 'undefined') {
    return 'dark'
  }

  const stored = localStorage.getItem('fc-theme')
  return stored === 'light' || stored === 'dark' ? stored : 'dark'
}

function App() {
  const [form, setForm] = useState(initialForm)
  const [incomeForm, setIncomeForm] = useState(initialIncomeForm)
  const [transferForm, setTransferForm] = useState(initialTransferForm)
  const [transactions, setTransactions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [user, setUser] = useState(null)
  const [authMode, setAuthMode] = useState('login')
  const [authForm, setAuthForm] = useState(initialAuthForm)
  const [authError, setAuthError] = useState('')
  const [authSubmitting, setAuthSubmitting] = useState(false)
  const [familyMembers, setFamilyMembers] = useState([])
  const [categories, setCategories] = useState([])
  const [memberForm, setMemberForm] = useState('')
  const [memberEditingId, setMemberEditingId] = useState('')
  const [categoryForm, setCategoryForm] = useState('')
  const [categoryEditingId, setCategoryEditingId] = useState('')
  const [activeTab, setActiveTab] = useState('overview')
  const [theme, setTheme] = useState(getPreferredTheme)
  const [reportForm, setReportForm] = useState(initialReportForm)

  useEffect(() => {
    document.body.dataset.theme = theme
    localStorage.setItem('fc-theme', theme)
  }, [theme])

  useEffect(() => {
    let unsubscribeTransactions = null
    let unsubscribeFamilyMembers = null
    let unsubscribeCategories = null

    const unsubscribeAuth = subscribeToAuth(async (currentUser) => {
      setUser(currentUser)

      if (!currentUser) {
        setTransactions([])
        setFamilyMembers([])
        setCategories([])
        setLoading(false)
        return
      }

      setLoading(true)
      unsubscribeTransactions?.()
      unsubscribeFamilyMembers?.()
      unsubscribeCategories?.()

      await ensureDefaultCategories(currentUser.uid)

      unsubscribeFamilyMembers = subscribeToFamilyMembers(
        currentUser.uid,
        (members) => {
          setFamilyMembers(members)
        },
        (subscriptionError) => {
          setError(`Не удалось обновить членов семьи: ${subscriptionError.message}`)
        },
      )

      unsubscribeCategories = subscribeToCategories(
        currentUser.uid,
        (items) => {
          setCategories(items)
        },
        (subscriptionError) => {
          setError(`Не удалось обновить категории: ${subscriptionError.message}`)
        },
      )

      unsubscribeTransactions = subscribeToTransactions(
        currentUser.uid,
        (items) => {
          setTransactions(items)
          setLoading(false)
        },
        (subscriptionError) => {
          setError(`Не удалось обновить операции: ${subscriptionError.message}`)
          setLoading(false)
        },
      )
    })

    return () => {
      unsubscribeAuth()
      unsubscribeTransactions?.()
      unsubscribeFamilyMembers?.()
      unsubscribeCategories?.()
    }
  }, [])

  const total = useMemo(
    () =>
      transactions.reduce((sum, item) => {
        if (item.type === 'transfer') {
          return sum
        }

        return item.type === 'income' ? sum + item.amount : sum - item.amount
      }, 0),
    [transactions],
  )

  const memberBalances = useMemo(() => {
    const balances = new Map()

    for (const member of familyMembers) {
      balances.set(member.id, 0)
    }

    for (const item of transactions) {
      if (item.type === 'transfer') {
        if (item.familyMemberId) {
          balances.set(item.familyMemberId, (balances.get(item.familyMemberId) ?? 0) - item.amount)
        }
        if (item.transferToMemberId) {
          balances.set(item.transferToMemberId, (balances.get(item.transferToMemberId) ?? 0) + item.amount)
        }
        continue
      }

      if (item.familyMemberId) {
        const current = balances.get(item.familyMemberId) ?? 0
        balances.set(item.familyMemberId, item.type === 'income' ? current + item.amount : current - item.amount)
      }
    }

    return balances
  }, [familyMembers, transactions])

  const reportTransactions = useMemo(() => {
    return transactions.filter((transaction) => {
      const { startDate, endDate, type, category, member } = reportForm

      if (startDate && new Date(transaction.date) < new Date(startDate)) {
        return false
      }

      if (endDate) {
        const end = new Date(endDate)
        end.setHours(23, 59, 59, 999)

        if (new Date(transaction.date) > end) {
          return false
        }
      }

      if (type !== 'all' && transaction.type !== type) {
        return false
      }

      if (category !== 'all' && transaction.category !== category) {
        return false
      }

      if (member !== 'all' && transaction.familyMemberId !== member) {
        return false
      }

      return true
    })
  }, [transactions, reportForm])

  const reportSummary = useMemo(() => {
    const income = reportTransactions
      .filter((item) => item.type === 'income')
      .reduce((sum, item) => sum + item.amount, 0)

    const expense = reportTransactions
      .filter((item) => item.type === 'expense')
      .reduce((sum, item) => sum + item.amount, 0)

    return {
      income,
      expense,
      balance: income - expense,
      count: reportTransactions.length,
    }
  }, [reportTransactions])

  const handleChange = (event) => {
    const { name, value } = event.target
    setForm((current) => ({ ...current, [name]: value }))
  }

  const handleAuthChange = (event) => {
    const { name, value } = event.target
    setAuthForm((current) => ({ ...current, [name]: value }))
  }

  const handleIncomeChange = (event) => {
    const { name, value } = event.target
    setIncomeForm((current) => ({ ...current, [name]: value }))
  }

  const handleTransferChange = (event) => {
    const { name, value } = event.target
    setTransferForm((current) => ({ ...current, [name]: value }))
  }

  const handleReportChange = (event) => {
    const { name, value } = event.target
    setReportForm((current) => ({ ...current, [name]: value }))
  }

  const handleAuthSubmit = async (event) => {
    event.preventDefault()

    if (!authForm.email.trim() || !authForm.password.trim()) {
      setAuthError('Введите email и пароль.')
      return
    }

    if (authForm.password.length < 6) {
      setAuthError('Пароль должен содержать минимум 6 символов.')
      return
    }

    setAuthSubmitting(true)
    setAuthError('')

    try {
      const action = authMode === 'register' ? signUp : signIn
      await action(authForm.email.trim(), authForm.password)
      setAuthForm(initialAuthForm)
    } catch (submitError) {
      setAuthError(submitError.message)
    } finally {
      setAuthSubmitting(false)
    }
  }

  const handleSubmit = async (event) => {
    event.preventDefault()

    if (!user) {
      setError('Сначала войдите в аккаунт.')
      return
    }

    if (!form.description.trim() || !Number(form.amount) || Number(form.amount) <= 0) {
      setError('Введите корректное описание и сумму больше нуля.')
      return
    }

    setSaving(true)
    setError('')

    try {
      await saveTransaction({ ...form, type: 'expense' }, user.uid)
      setForm(initialForm)
    } catch (submitError) {
      setError(submitError.message)
    } finally {
      setSaving(false)
    }
  }

  const handleIncomeSubmit = async (event) => {
      event.preventDefault()

      if (!incomeForm.description.trim() || !Number(incomeForm.amount) || Number(incomeForm.amount) <= 0) {
        setError('Введите корректное описание и сумму дохода больше нуля.')
        return
      }

      setSaving(true)
      setError('')

      try {
        await saveTransaction({ ...incomeForm, type: 'income', category: 'Salary' }, user.uid)
        setIncomeForm(initialIncomeForm)
      } catch (submitError) {
        setError(submitError.message)
      } finally {
        setSaving(false)
      }
    }

  const handleTransferSubmit = async (event) => {
      event.preventDefault()

      const senderBalance = memberBalances.get(transferForm.familyMemberId) ?? 0

      if (
        !transferForm.description.trim() ||
        !Number(transferForm.amount) ||
        Number(transferForm.amount) <= 0 ||
        !transferForm.familyMemberId ||
        !transferForm.transferToMemberId ||
        transferForm.familyMemberId === transferForm.transferToMemberId
      ) {
        setError('Выберите разных отправителя и получателя и укажите сумму больше нуля.')
        return
      }

      if (Number(transferForm.amount) > senderBalance) {
        setError(
          `Сумма передачи не может превышать остаток отправителя: ${senderBalance.toLocaleString('ru-RU', {
            style: 'currency',
            currency: 'RUB',
          })}.`,
        )
        return
      }

      setSaving(true)
      setError('')

      try {
        await saveTransaction({ ...transferForm, type: 'transfer', category: 'Transfer' }, user.uid)
        setTransferForm(initialTransferForm)
      } catch (submitError) {
        setError(submitError.message)
      } finally {
        setSaving(false)
    }
  }

  const handleSignOut = async () => {
    try {
      await signOutUser()
    } catch (signOutError) {
      setAuthError(signOutError.message)
    }
  }

  const handleAddMember = async (event) => {
    event.preventDefault()

    if (!memberForm.trim()) {
      return
    }

    try {
      if (memberEditingId) {
        await updateFamilyMember(memberEditingId, user.uid, memberForm)
      } else {
        await addFamilyMember(user.uid, memberForm)
      }
      setMemberForm('')
      setMemberEditingId('')
    } catch (submitError) {
      setError(submitError.message)
    }
  }

  const handleEditMember = (member) => {
    setMemberEditingId(member.id)
    setMemberForm(member.name)
  }

  const handleDeleteMember = async (memberId) => {
    try {
      await deleteFamilyMember(memberId)
    } catch (submitError) {
      setError(submitError.message)
    }
  }

  const handleAddCategory = async (event) => {
    event.preventDefault()

    if (!categoryForm.trim()) {
      return
    }

    try {
      if (categoryEditingId) {
        await updateCategory(categoryEditingId, user.uid, categoryForm)
      } else {
        await addCategory(user.uid, categoryForm)
      }
      setCategoryForm('')
      setCategoryEditingId('')
    } catch (submitError) {
      setError(submitError.message)
    }
  }

  const handleEditCategory = (category) => {
    setCategoryEditingId(category.id)
    setCategoryForm(category.name)
  }

  const handleDeleteCategory = async (categoryId) => {
    try {
      await deleteCategory(categoryId)
    } catch (submitError) {
      setError(submitError.message)
    }
  }

  const getTransactionMembers = (transaction) => {
    const from = familyMembers.find((member) => member.id === transaction.familyMemberId)
    const to = familyMembers.find((member) => member.id === transaction.transferToMemberId)

    if (transaction.type === 'transfer') {
      return `${from?.name ?? 'Не указан'} → ${to?.name ?? 'Не указан'}`
    }

    return from?.name ?? 'Общий'
  }

  const getTransactionSign = (transaction) => {
    if (transaction.type === 'transfer') {
      return '↔'
    }

    return transaction.type === 'income' ? '+' : '-'
  }

  return (
    <div className="page-shell">
      <aside className="panel summary-panel">
        <p className="eyebrow">Финансовый учёт</p>
        <h1>ZFAMILYCASH</h1>

        {user ? (
          <div className="user-box">
            <span>Аккаунт</span>
            <strong>{user.email}</strong>
            <button type="button" className="secondary-button" onClick={handleSignOut}>
              Выйти
            </button>
          </div>
        ) : (
          <div className="auth-box">
            <h2>{authMode === 'login' ? 'Вход' : 'Регистрация'}</h2>

            {!firebaseReady && (
              <div className="notice warning">
                Firebase не настроен. Создайте файл .env по примеру .env.example и укажите конфиг проекта.
              </div>
            )}

            {authError && <div className="notice error">{authError}</div>}

            <form onSubmit={handleAuthSubmit} className="auth-form">
              <label>
                Email
                <input
                  type="email"
                  name="email"
                  value={authForm.email}
                  onChange={handleAuthChange}
                  placeholder="name@example.com"
                />
              </label>

              <label>
                Пароль
                <input
                  type="password"
                  name="password"
                  value={authForm.password}
                  onChange={handleAuthChange}
                  placeholder="Минимум 6 символов"
                />
              </label>

              <button type="submit" className="auth-button" disabled={authSubmitting || !firebaseReady}>
                {authSubmitting ? 'Подождите...' : authMode === 'login' ? 'Войти' : 'Создать аккаунт'}
              </button>
            </form>

            <button
              type="button"
              className="link-button"
              onClick={() => {
                setAuthMode((current) => (current === 'login' ? 'register' : 'login'))
                setAuthError('')
              }}
            >
              {authMode === 'login' ? 'Нет аккаунта? Зарегистрироваться' : 'Уже есть аккаунт? Войти'}
            </button>
          </div>
        )}

        <div className="balance-box">
          <span>Баланс</span>
          <strong>{total.toLocaleString('ru-RU', { style: 'currency', currency: 'RUB' })}</strong>
        </div>

        <div className="stats-grid">
          <div>
            <span>Доход</span>
            <strong>
              {transactions
                .filter((item) => item.type === 'income')
                .reduce((sum, item) => sum + item.amount, 0)
                .toLocaleString('ru-RU', { style: 'currency', currency: 'RUB' })}
            </strong>
          </div>
          <div>
            <span>Расход</span>
            <strong>
              {transactions
                .filter((item) => item.type === 'expense')
                .reduce((sum, item) => sum + item.amount, 0)
                .toLocaleString('ru-RU', { style: 'currency', currency: 'RUB' })}
            </strong>
          </div>
        </div>

        {user && familyMembers.length > 0 && (
          <div className="member-balance-box">
            <h3>Остаток по членам семьи</h3>
            <ul>
              {familyMembers.map((member) => (
                <li key={member.id}>
                  <span>{member.name}</span>
                  <strong>
                    {(memberBalances.get(member.id) ?? 0).toLocaleString('ru-RU', {
                      style: 'currency',
                      currency: 'RUB',
                    })}
                  </strong>
                </li>
              ))}
            </ul>
          </div>
        )}

        {user && (
          <div className="side-menu">
            <button
              type="button"
              className={activeTab === 'overview' ? 'menu-button active' : 'menu-button'}
              onClick={() => setActiveTab('overview')}
            >
              Главная
            </button>
            <button
              type="button"
              className={activeTab === 'income' ? 'menu-button active' : 'menu-button'}
              onClick={() => setActiveTab('income')}
            >
              Доходы и переводы
            </button>
            <button
              type="button"
              className={activeTab === 'members' ? 'menu-button active' : 'menu-button'}
              onClick={() => setActiveTab('members')}
            >
              Члены семьи
            </button>
            <button
              type="button"
              className={activeTab === 'categories' ? 'menu-button active' : 'menu-button'}
              onClick={() => setActiveTab('categories')}
            >
              Категории
            </button>
            <button
              type="button"
              className={activeTab === 'settings' ? 'menu-button active' : 'menu-button'}
              onClick={() => setActiveTab('settings')}
            >
              Настройки
            </button>
            <button
              type="button"
              className={activeTab === 'reports' ? 'menu-button active' : 'menu-button'}
              onClick={() => setActiveTab('reports')}
            >
              Отчёты
            </button>
          </div>
        )}
      </aside>

      <main className="panel content-panel">
        {user && activeTab === 'overview' && (
          <>
            <section className="form-section">
              <h2>Добавить операцию</h2>

              {error && <div className="notice error">{error}</div>}

              <form onSubmit={handleSubmit} className="transaction-form">
                <label>
                  Описание
                  <input
                    name="description"
                    value={form.description}
                    onChange={handleChange}
                    placeholder="Например: Продукты"
                  />
                </label>

                <div className="field-row">
                  <label>
                    Сумма
                    <input
                      name="amount"
                      type="number"
                      min="0.01"
                      step="0.01"
                      value={form.amount}
                      onChange={handleChange}
                      placeholder="0.00"
                    />
                  </label>

                  <label>
                    Член семьи
                    <select name="familyMemberId" value={form.familyMemberId} onChange={handleChange}>
                      <option value="">Общий расход</option>
                      {familyMembers.map((member) => (
                        <option key={member.id} value={member.id}>
                          {member.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <div className="field-row">
                  <label>
                    Категория
                    <select name="category" value={form.category} onChange={handleChange}>
                      {categories.map((category) => (
                        <option key={category.id} value={category.name}>
                          {category.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <div className="field-row">
                  <label>
                    Дата
                    <input name="date" type="date" value={form.date} onChange={handleChange} />
                  </label>
                </div>

                <button type="submit" disabled={saving || !firebaseReady}>
                  {saving ? 'Сохранение...' : 'Сохранить'}
                </button>
              </form>
            </section>
          </>
        )}

        {user && activeTab === 'income' && (
          <section className="reference-block">
            <div className="reference-header">
              <h2>Доходы и переводы</h2>
            </div>

            {error && <div className="notice error">{error}</div>}

            <div className="settings-group">
              <h3>Зарплата или другой доход</h3>
              <form onSubmit={handleIncomeSubmit} className="transaction-form">
                <label>
                  Описание
                  <input name="description" value={incomeForm.description} onChange={handleIncomeChange} />
                </label>
                <div className="field-row">
                  <label>
                    Сумма
                    <input name="amount" type="number" min="0.01" step="0.01" value={incomeForm.amount} onChange={handleIncomeChange} />
                  </label>
                  <label>
                    Получатель
                    <select name="familyMemberId" value={incomeForm.familyMemberId} onChange={handleIncomeChange}>
                      <option value="">Общий доход</option>
                      {familyMembers.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}
                    </select>
                  </label>
                </div>
                <label>
                  Дата
                  <input name="date" type="date" value={incomeForm.date} onChange={handleIncomeChange} />
                </label>
                <button type="submit" disabled={saving || !firebaseReady}>{saving ? 'Сохранение...' : 'Добавить доход'}</button>
              </form>
            </div>

            <div className="settings-group">
              <h3>Передача остатка между членами семьи</h3>
              <form onSubmit={handleTransferSubmit} className="transaction-form">
                <label>
                  Описание
                  <input name="description" value={transferForm.description} onChange={handleTransferChange} />
                </label>
                <div className="field-row">
                  <label>
                    От кого
                    <select name="familyMemberId" value={transferForm.familyMemberId} onChange={handleTransferChange}>
                      <option value="">Выберите отправителя</option>
                      {familyMembers.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}
                    </select>
                    {transferForm.familyMemberId && (
                      <small className="field-hint">
                        Доступно:{' '}
                        {(memberBalances.get(transferForm.familyMemberId) ?? 0).toLocaleString('ru-RU', {
                          style: 'currency',
                          currency: 'RUB',
                        })}
                      </small>
                    )}
                  </label>
                  <label>
                    Кому
                    <select name="transferToMemberId" value={transferForm.transferToMemberId} onChange={handleTransferChange}>
                      <option value="">Выберите получателя</option>
                      {familyMembers.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}
                    </select>
                  </label>
                </div>
                <div className="field-row">
                  <label>
                    Сумма
                    <input name="amount" type="number" min="0.01" step="0.01" value={transferForm.amount} onChange={handleTransferChange} />
                  </label>
                  <label>
                    Дата
                    <input name="date" type="date" value={transferForm.date} onChange={handleTransferChange} />
                  </label>
                </div>
                <button type="submit" disabled={saving || !firebaseReady}>{saving ? 'Сохранение...' : 'Добавить передачу'}</button>
              </form>
            </div>
          </section>
        )}

        {user && activeTab === 'members' && (
          <section className="reference-block">
            <div className="reference-header">
              <h2>Справочник членов семьи</h2>
            </div>

            <form onSubmit={handleAddMember} className="reference-form">
              <input
                value={memberForm}
                onChange={(event) => setMemberForm(event.target.value)}
                placeholder="Имя члена семьи"
              />
              <button type="submit">{memberEditingId ? 'Сохранить' : 'Добавить'}</button>
              {memberEditingId && (
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => {
                    setMemberEditingId('')
                    setMemberForm('')
                  }}
                >
                  Отмена
                </button>
              )}
            </form>

            <ul className="reference-list">
              {familyMembers.map((member) => (
                <li key={member.id}>
                  <span>{member.name}</span>
                  <div className="reference-actions">
                    <button type="button" onClick={() => handleEditMember(member)}>
                      Изменить
                    </button>
                    <button type="button" className="danger" onClick={() => handleDeleteMember(member.id)}>
                      Удалить
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        {user && activeTab === 'categories' && (
          <section className="reference-block">
            <div className="reference-header">
              <h2>Справочник категорий</h2>
            </div>

            <form onSubmit={handleAddCategory} className="reference-form">
              <input
                value={categoryForm}
                onChange={(event) => setCategoryForm(event.target.value)}
                placeholder="Название категории"
              />
              <button type="submit">{categoryEditingId ? 'Сохранить' : 'Добавить'}</button>
              {categoryEditingId && (
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => {
                    setCategoryEditingId('')
                    setCategoryForm('')
                  }}
                >
                  Отмена
                </button>
              )}
            </form>

            <ul className="reference-list">
              {categories.map((category) => (
                <li key={category.id}>
                  <span>{category.name}</span>
                  <div className="reference-actions">
                    <button type="button" onClick={() => handleEditCategory(category)}>
                      Изменить
                    </button>
                    <button type="button" className="danger" onClick={() => handleDeleteCategory(category.id)}>
                      Удалить
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        {user && activeTab === 'settings' && (
          <section className="reference-block">
            <div className="reference-header">
              <h2>Настройки</h2>
            </div>

            <div className="settings-group">
              <h3>Тема приложения</h3>
              <div className="theme-switcher">
                <button
                  type="button"
                  className={theme === 'dark' ? 'theme-button active' : 'theme-button'}
                  onClick={() => setTheme('dark')}
                >
                  Тёмная
                </button>
                <button
                  type="button"
                  className={theme === 'light' ? 'theme-button active' : 'theme-button'}
                  onClick={() => setTheme('light')}
                >
                  Светлая
                </button>
              </div>
            </div>
          </section>
        )}

        {user && activeTab === 'reports' && (
          <section className="reference-block">
            <div className="reference-header">
              <h2>Отчётность</h2>
            </div>

            <form className="report-form">
              <div className="field-row">
                <label>
                  Дата с
                  <input type="date" name="startDate" value={reportForm.startDate} onChange={handleReportChange} />
                </label>

                <label>
                  Дата по
                  <input type="date" name="endDate" value={reportForm.endDate} onChange={handleReportChange} />
                </label>
              </div>

              <div className="field-row">
                <label>
                  Тип
                  <select name="type" value={reportForm.type} onChange={handleReportChange}>
                    <option value="all">Все</option>
                    <option value="income">Доход</option>
                    <option value="expense">Расход</option>
                    <option value="transfer">Передача</option>
                  </select>
                </label>

                <label>
                  Категория
                  <select name="category" value={reportForm.category} onChange={handleReportChange}>
                    <option value="all">Все</option>
                    {categories.map((category) => (
                      <option key={category.id} value={category.name}>
                        {category.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="field-row">
                <label>
                  Член семьи
                  <select name="member" value={reportForm.member} onChange={handleReportChange}>
                    <option value="all">Все</option>
                    {familyMembers.map((member) => (
                      <option key={member.id} value={member.id}>
                        {member.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </form>

            <div className="report-summary">
              <div>
                <span>Доход</span>
                <strong>{reportSummary.income.toLocaleString('ru-RU', { style: 'currency', currency: 'RUB' })}</strong>
              </div>
              <div>
                <span>Расход</span>
                <strong>{reportSummary.expense.toLocaleString('ru-RU', { style: 'currency', currency: 'RUB' })}</strong>
              </div>
              <div>
                <span>Итог</span>
                <strong>{reportSummary.balance.toLocaleString('ru-RU', { style: 'currency', currency: 'RUB' })}</strong>
              </div>
            </div>

            {reportTransactions.length === 0 ? (
              <p className="empty-state">Нет операций по выбранным критериям.</p>
            ) : (
              <ul className="transaction-list">
                {reportTransactions.map((transaction) => {
                  return (
                    <li key={transaction.id} className={transaction.type}>
                      <div>
                        <strong>{transaction.description}</strong>
                        <small>
                          {transaction.category} • {getTransactionMembers(transaction)} • {transaction.date}
                        </small>
                      </div>
                      <span>
                        {getTransactionSign(transaction)}
                        {transaction.amount.toLocaleString('ru-RU', { style: 'currency', currency: 'RUB' })}
                      </span>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>
        )}

        {user && activeTab === 'overview' && (
          <section className="list-section">
            <div className="list-header">
              <h2>Последние операции</h2>
            </div>

            {loading ? (
              <p className="empty-state">Загрузка данных...</p>
            ) : transactions.length === 0 ? (
              <p className="empty-state">Пока нет записей. Добавьте первую операцию.</p>
            ) : (
              <ul className="transaction-list">
                {transactions.map((transaction) => {
                  return (
                    <li key={transaction.id} className={transaction.type}>
                      <div>
                        <strong>{transaction.description}</strong>
                        <small>
                          {transaction.category} • {getTransactionMembers(transaction)} • {transaction.date}
                        </small>
                      </div>
                      <span>
                        {getTransactionSign(transaction)}
                        {transaction.amount.toLocaleString('ru-RU', { style: 'currency', currency: 'RUB' })}
                      </span>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>
        )}
      </main>
    </div>
  )
}

export default App
