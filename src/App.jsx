import { useEffect, useMemo, useRef, useState } from 'react'
import './App.css'
import {
  addBudget,
  addCategory,
  addFamilyMember,
  addPlannedPurchase,
  defaultCategories,
  deleteBudget,
  deleteCategory,
  deleteFamilyMember,
  deletePlannedPurchase,
  deleteTransaction,
  ensureDefaultCategories,
  ensureFamilyContext,
  firebaseReady,
  joinFamily,
  linkUserToFamilyMember,
  saveTransaction,
  signIn,
  signOutUser,
  signUp,
  subscribeToAuth,
  subscribeToBudgets,
  subscribeToCategories,
  subscribeToFamilyMembers,
  subscribeToPlannedPurchases,
  subscribeToTransactions,
  updateBudget,
  updateCategory,
  updateFamilyMember,
  updatePlannedPurchase,
  updateTransaction,
} from './firebase'

const initialForm = {
  description: '',
  amount: '',
  category: defaultCategories[0],
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

const getDateISO = (date) => date.toISOString().slice(0, 10)

const getLastWeekRange = () => {
  const endDate = new Date()
  const startDate = new Date(endDate)
  startDate.setDate(endDate.getDate() - 6)

  return {
    startDate: getDateISO(startDate),
    endDate: getDateISO(endDate),
  }
}

const getNextWeekRange = () => {
  const startDate = new Date()
  startDate.setDate(startDate.getDate() + 1)
  const endDate = new Date(startDate)
  endDate.setDate(startDate.getDate() + 6)

  return {
    startDate: getDateISO(startDate),
    endDate: getDateISO(endDate),
  }
}

const getLastDaysRange = (days) => {
  const endDate = new Date()
  const startDate = new Date(endDate)
  startDate.setDate(endDate.getDate() - (days - 1))

  return {
    startDate: getDateISO(startDate),
    endDate: getDateISO(endDate),
  }
}

const getMonthRange = () => {
  const endDate = new Date()
  const startDate = new Date(endDate.getFullYear(), endDate.getMonth(), 1)

  return {
    startDate: getDateISO(startDate),
    endDate: getDateISO(endDate),
  }
}

const initialReportForm = {
  ...getLastWeekRange(),
  type: 'all',
  category: 'all',
  member: 'all',
}

const initialPlannedPurchaseForm = {
  title: '',
  amount: '',
  category: defaultCategories[0],
  plannedDate: new Date().toISOString().slice(0, 10),
  notes: '',
}

const initialBudgetForm = {
  category: defaultCategories[0],
  month: new Date().toISOString().slice(0, 7),
  amount: '',
}

const changelogEntries = [
  {
    version: '1.0',
    date: '2025-09-11',
    title: 'Базовый финансовый учёт',
    items: [
      'Добавлена авторизация и семейный контекст для общего учёта.',
      'Поддержаны доходы, расходы, переводы между участниками семьи.',
      'Добавлены справочники категорий и членов семьи.',
    ],
  },
  {
    version: '1.1',
    date: '2025-09-12',
    title: 'Настройки, отчёты и визуальная навигация',
    items: [
      'Добавлено переключение светлой и тёмной темы.',
      'Внедрён раздел отчётности по периоду, типу, категории и участнику.',
      'Переход к левому меню для быстрого доступа к разделам приложения.',
    ],
  },
  {
    version: '1.2',
    date: '2025-09-13',
    title: 'Планы покупок и история доработок',
    items: [
      'Добавлены планы покупок с привязкой к категории и целевой дате.',
      'Добавлена история улучшений и новых функций в формате журнала.',
      'Улучшена структура данных для семейного планирования и контроля расходов.',
    ],
  },
  {
    version: '1.3',
    date: '2026-09-11',
    title: 'Умный бюджет и разделение категорий',
    items: [
      'Разделены категории на доходы и расходы, чтобы в формах не отображались лишние пункты.',
      'Добавлены умные карточки бюджета с анализом ближайших трат и рисков по лимитам.',
      'Улучшен обзор семейных расходов: календарь оплат, рекомендации и общая сводка по бюджету.',
      'Стабилизирована логика фильтрации и сброса параметров в отчётах и операциях.',
    ],
  },
]

const getPreferredTheme = () => {
  if (typeof window === 'undefined') {
    return 'dark'
  }

  const stored = localStorage.getItem('fc-theme')
  return stored === 'light' || stored === 'dark' ? stored : 'dark'
}

const getCategoryChoicesByType = (categoriesList, type) => {
  if (!type || type === 'all') {
    return categoriesList
  }

  const normalizedType = type === 'income' ? 'income' : 'expense'
  return categoriesList.filter((category) => category.type === normalizedType)
}

const isCategoryAllowedForType = (categoryName, selectedType, categoriesList) => {
  if (!categoryName || categoryName === 'all' || selectedType === 'all') {
    return true
  }

  return getCategoryChoicesByType(categoriesList, selectedType).some((category) => category.name === categoryName)
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
  const [categoryType, setCategoryType] = useState('expense')
  const [categoryEditingId, setCategoryEditingId] = useState('')
  const [activeTab, setActiveTab] = useState('overview')
  const [theme, setTheme] = useState(getPreferredTheme)
  const [reportForm, setReportForm] = useState(initialReportForm)
  const [operationsFilter, setOperationsFilter] = useState({
    ...getLastWeekRange(),
    type: 'all',
    category: 'all',
    member: 'all',
  })
  const [plannedFilter, setPlannedFilter] = useState(getNextWeekRange())
  const [transactionEditingId, setTransactionEditingId] = useState('')
  const [plannedPurchases, setPlannedPurchases] = useState([])
  const [plannedPurchaseForm, setPlannedPurchaseForm] = useState(initialPlannedPurchaseForm)
  const [plannedPurchaseEditingId, setPlannedPurchaseEditingId] = useState('')
  const [budgets, setBudgets] = useState([])
  const [budgetForm, setBudgetForm] = useState(initialBudgetForm)
  const [budgetEditingId, setBudgetEditingId] = useState('')
  const [familyContext, setFamilyContext] = useState(null)
  const [joinCode, setJoinCode] = useState('')
  const [familyMessage, setFamilyMessage] = useState('')
  const [selectedFamilyMemberId, setSelectedFamilyMemberId] = useState('')
  const [quickExpenseOpen, setQuickExpenseOpen] = useState(false)
  const [quickExpenseStep, setQuickExpenseStep] = useState('member')
  const [quickExpenseMemberId, setQuickExpenseMemberId] = useState('')
  const [quickExpenseCategory, setQuickExpenseCategory] = useState(defaultCategories[0])
  const [quickExpenseForm, setQuickExpenseForm] = useState({
    description: '',
    amount: '',
    date: new Date().toISOString().slice(0, 10),
  })
  const amountInputRef = useRef(null)

  useEffect(() => {
    document.body.dataset.theme = theme
    localStorage.setItem('fc-theme', theme)
  }, [theme])

  useEffect(() => {
    if (quickExpenseOpen && quickExpenseStep === 'form') {
      const timer = window.setTimeout(() => {
        amountInputRef.current?.focus()
        amountInputRef.current?.select()
      }, 100)

      return () => window.clearTimeout(timer)
    }

    return undefined
  }, [quickExpenseOpen, quickExpenseStep])

  useEffect(() => {
    let unsubscribeTransactions = null
    let unsubscribeFamilyMembers = null
    let unsubscribeCategories = null
    let unsubscribePlannedPurchases = null
    let unsubscribeBudgets = null

    const unsubscribeAuth = subscribeToAuth(async (currentUser) => {
      setUser(currentUser)

      if (!currentUser) {
        setTransactions([])
        setFamilyMembers([])
        setCategories([])
        setPlannedPurchases([])
        setBudgets([])
        setFamilyContext(null)
        setLoading(false)
        return
      }

      setLoading(true)
      unsubscribeTransactions?.()
      unsubscribeFamilyMembers?.()
      unsubscribeCategories?.()
      unsubscribePlannedPurchases?.()
      unsubscribeBudgets?.()

      const context = await ensureFamilyContext(currentUser)
      setFamilyContext(context)
      await ensureDefaultCategories(context.familyId)

      unsubscribeFamilyMembers = subscribeToFamilyMembers(
        context.familyId,
        (members) => {
          setFamilyMembers(members)
        },
        (subscriptionError) => {
          setError(`Не удалось обновить членов семьи: ${subscriptionError.message}`)
        },
      )

      unsubscribeCategories = subscribeToCategories(
        context.familyId,
        (items) => {
          setCategories(items)
        },
        (subscriptionError) => {
          setError(`Не удалось обновить категории: ${subscriptionError.message}`)
        },
      )

      unsubscribeTransactions = subscribeToTransactions(
        context.familyId,
        (items) => {
          setTransactions(items)
          setLoading(false)
        },
        (subscriptionError) => {
          setError(`Не удалось обновить операции: ${subscriptionError.message}`)
          setLoading(false)
        },
      )

      unsubscribePlannedPurchases = subscribeToPlannedPurchases(
        context.familyId,
        (items) => {
          setPlannedPurchases(items)
        },
        (subscriptionError) => {
          setError(`Не удалось обновить планы покупок: ${subscriptionError.message}`)
        },
      )

      unsubscribeBudgets = subscribeToBudgets(
        context.familyId,
        (items) => {
          setBudgets(items)
        },
        (subscriptionError) => {
          setError(`Не удалось обновить лимиты бюджета: ${subscriptionError.message}`)
        },
      )
    })

    return () => {
      unsubscribeAuth()
      unsubscribeTransactions?.()
      unsubscribeFamilyMembers?.()
      unsubscribeCategories?.()
      unsubscribePlannedPurchases?.()
      unsubscribeBudgets?.()
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

  const matchesPeriod = (transactionDate, startDate, endDate) => {
    if (startDate) {
      const start = new Date(startDate)
      start.setHours(0, 0, 0, 0)
      if (new Date(transactionDate) < start) {
        return false
      }
    }

    if (endDate) {
      const end = new Date(endDate)
      end.setHours(23, 59, 59, 999)
      if (new Date(transactionDate) > end) {
        return false
      }
    }

    return true
  }

  const reportTransactions = useMemo(() => {
    return transactions.filter((transaction) => {
      const { startDate, endDate, type, category, member } = reportForm

      if (!matchesPeriod(transaction.date, startDate, endDate)) {
        return false
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

  const filteredOperations = useMemo(() => {
    return transactions.filter((transaction) => {
      const { startDate, endDate, type, category, member } = operationsFilter

      if (!matchesPeriod(transaction.date, startDate, endDate)) {
        return false
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
  }, [transactions, operationsFilter])

  const plannedFilterTransactions = useMemo(() => {
    return plannedPurchases.filter((purchase) => {
      const { startDate, endDate } = plannedFilter

      if (startDate && new Date(purchase.plannedDate) < new Date(startDate)) {
        return false
      }

      if (endDate) {
        const end = new Date(endDate)
        end.setHours(23, 59, 59, 999)
        if (new Date(purchase.plannedDate) > end) {
          return false
        }
      }

      return true
    })
  }, [plannedPurchases, plannedFilter])

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

  const monthlyBudgetRows = useMemo(() => {
    const activeMonth = budgetForm.month || new Date().toISOString().slice(0, 7)

    return categories.map((category) => {
      const limit = budgets.find((item) => item.category === category.name && item.month === activeMonth)?.amount ?? 0
      const spent = transactions
        .filter(
          (item) =>
            item.type === 'expense' &&
            item.category === category.name &&
            item.date.startsWith(activeMonth),
        )
        .reduce((sum, item) => sum + item.amount, 0)

      return {
        category: category.name,
        limit,
        spent,
        remaining: limit - spent,
      }
    })
  }, [budgets, categories, transactions, budgetForm.month])

  const plannedOverview = useMemo(() => {
    const total = plannedPurchases.reduce((sum, item) => sum + Number(item.amount || 0), 0)
    const soon = plannedPurchases.filter((item) => {
      const diffDays = Math.ceil((new Date(item.plannedDate) - new Date()) / (1000 * 60 * 60 * 24))
      return diffDays >= 0 && diffDays <= 30
    }).length

    return {
      total,
      count: plannedPurchases.length,
      soon,
    }
  }, [plannedPurchases])

  const budgetInsights = useMemo(() => {
    const currentMonth = new Date().toISOString().slice(0, 7)
    const monthlyExpenses = transactions.filter(
      (item) => item.type === 'expense' && item.date.startsWith(currentMonth),
    )

    const rows = categories
      .map((category) => {
        const spent = monthlyExpenses
          .filter((item) => item.category === category.name)
          .reduce((sum, item) => sum + item.amount, 0)
        const limit = budgets.find((item) => item.category === category.name && item.month === currentMonth)?.amount ?? 0

        return {
          category: category.name,
          spent,
          limit,
          remaining: limit - spent,
        }
      })
      .filter((item) => item.spent > 0 || item.limit > 0)
      .sort((left, right) => {
        if (left.remaining === right.remaining) {
          return right.spent - left.spent
        }

        return left.remaining - right.remaining
      })

    const risks = rows.filter((item) => item.limit > 0 && item.remaining < 0)
    const soonest = [...plannedPurchases]
      .filter((item) => new Date(item.plannedDate) >= new Date())
      .sort((left, right) => new Date(left.plannedDate) - new Date(right.plannedDate))
      .slice(0, 3)

    const totalSpent = monthlyExpenses.reduce((sum, item) => sum + item.amount, 0)
    const totalBudget = budgets
      .filter((item) => item.month === currentMonth)
      .reduce((sum, item) => sum + item.amount, 0)

    return {
      rows,
      risks,
      soonest,
      totalSpent,
      totalBudget,
      availableBudget: totalBudget - totalSpent,
    }
  }, [budgets, categories, plannedPurchases, transactions])

  const paymentCalendar = useMemo(() => {
    const now = new Date()
    const targetDate = new Date(now)
    targetDate.setDate(now.getDate() + 30)

    return [...plannedPurchases]
      .filter((item) => new Date(item.plannedDate) >= now && new Date(item.plannedDate) <= targetDate)
      .sort((left, right) => new Date(left.plannedDate) - new Date(right.plannedDate))
      .slice(0, 5)
      .map((item) => ({
        ...item,
        diffDays: Math.ceil((new Date(item.plannedDate) - now) / (1000 * 60 * 60 * 24)),
      }))
  }, [plannedPurchases])

  const spendingAdvice = useMemo(() => {
    const currentMonth = new Date().toISOString().slice(0, 7)
    const monthExpenses = transactions.filter(
      (item) => item.type === 'expense' && item.date.startsWith(currentMonth),
    )

    const grouped = categories
      .map((category) => {
        const spent = monthExpenses
          .filter((item) => item.category === category.name)
          .reduce((sum, item) => sum + item.amount, 0)
        const limit = budgets.find((item) => item.category === category.name && item.month === currentMonth)?.amount ?? 0

        return {
          category: category.name,
          spent,
          limit,
          usage: limit ? (spent / limit) * 100 : 0,
        }
      })
      .filter((category) => category.spent > 0)
      .sort((left, right) => right.spent - left.spent)

    const topCategory = grouped[0]
    const nextCategory = grouped[1]
    const totalSpent = monthExpenses.reduce((sum, item) => sum + item.amount, 0)
    const average = grouped.length ? totalSpent / grouped.length : 0

    const advice = []

    if (topCategory && topCategory.usage > 90) {
      advice.push(`Категория “${topCategory.category}” уже близка к лимиту — стоит замедлить покупки в ней на этой неделе.`)
    }

    if (nextCategory && nextCategory.spent > average) {
      advice.push(`Сейчас “${nextCategory.category}” расходится сильнее среднего по месяцу, проверьте, что это действительно необходимые траты.`)
    }

    if (budgetInsights.availableBudget < 0) {
      advice.push(`Общий лимит по месяцам уже превышен на ${Math.abs(budgetInsights.availableBudget).toLocaleString('ru-RU', { style: 'currency', currency: 'RUB' })}. Подумайте, где сократить траты.`)
    }

    if (!advice.length) {
      advice.push('Динамика пока стабильная. Хороший момент, чтобы удержать текущий уровень трат и сохранить запас на будущие покупки.')
    }

    return advice.slice(0, 3)
  }, [budgetInsights.availableBudget, budgets, categories, transactions])

  const categorySpending = useMemo(() => {
    const month = reportForm.startDate ? reportForm.startDate.slice(0, 7) : new Date().toISOString().slice(0, 7)
    const filtered = transactions.filter(
      (item) =>
        item.type === 'expense' &&
        item.date.startsWith(month) &&
        (!reportForm.member || reportForm.member === 'all' || item.familyMemberId === reportForm.member),
    )

    const total = filtered.reduce((sum, item) => sum + item.amount, 0)

    return filtered
      .reduce((groups, item) => {
        const current = groups[item.category] || 0
        groups[item.category] = current + item.amount
        return groups
      }, {})
      .entries?.() ? [] : []
  }, [transactions, reportForm.startDate, reportForm.member])

  const categorySpendingRows = useMemo(() => {
    const activeMonth = reportForm.startDate ? reportForm.startDate.slice(0, 7) : new Date().toISOString().slice(0, 7)
    const filtered = transactions.filter(
      (item) =>
        item.type === 'expense' &&
        item.date.startsWith(activeMonth) &&
        (reportForm.member === 'all' || !reportForm.member || item.familyMemberId === reportForm.member),
    )

    const grouped = filtered.reduce((result, item) => {
      result[item.category] = (result[item.category] || 0) + item.amount
      return result
    }, {})

    const rows = Object.entries(grouped)
      .map(([category, amount]) => ({ category, amount }))
      .sort((left, right) => right.amount - left.amount)

    const total = rows.reduce((sum, row) => sum + row.amount, 0)

    return rows.map((row) => ({
      ...row,
      percent: total ? (row.amount / total) * 100 : 0,
    }))
  }, [transactions, reportForm.startDate, reportForm.member])

  const categoryDonutData = useMemo(() => {
    const activeMonth = reportForm.startDate ? reportForm.startDate.slice(0, 7) : new Date().toISOString().slice(0, 7)

    const filtered = transactions.filter(
      (item) =>
        item.type === 'expense' &&
        item.date.startsWith(activeMonth) &&
        (reportForm.member === 'all' || !reportForm.member || item.familyMemberId === reportForm.member),
    )

    const grouped = filtered.reduce((result, item) => {
      result[item.category] = (result[item.category] || 0) + item.amount
      return result
    }, {})

    const rows = Object.entries(grouped)
      .map(([category, amount]) => ({ category, amount }))
      .sort((left, right) => right.amount - left.amount)

    const total = rows.reduce((sum, row) => sum + row.amount, 0)

    return rows.map((row, index) => ({
      ...row,
      percent: total ? (row.amount / total) * 100 : 0,
      color: ['#38bdf8', '#34d399', '#fbbf24', '#f472b6', '#a78bfa', '#f97316', '#60a5fa'][index % 7],
    }))
  }, [transactions, reportForm.startDate, reportForm.member])

  const budgetVsFact = useMemo(() => {
    const activeMonth = reportForm.startDate ? reportForm.startDate.slice(0, 7) : new Date().toISOString().slice(0, 7)

    return categories.map((category) => {
      const limit = budgets.find((item) => item.category === category.name && item.month === activeMonth)?.amount ?? 0
      const spent = transactions
        .filter(
          (item) =>
            item.type === 'expense' &&
            item.category === category.name &&
            item.date.startsWith(activeMonth),
        )
        .reduce((sum, item) => sum + item.amount, 0)

      return {
        category: category.name,
        limit,
        spent,
        remaining: limit - spent,
      }
    })
  }, [budgets, categories, transactions, reportForm.startDate])

  const monthlyTrend = useMemo(() => {
    const now = new Date()
    const entries = Array.from({ length: 6 }, (_, index) => {
      const date = new Date(now.getFullYear(), now.getMonth() - 5 + index, 1)
      const monthKey = date.toISOString().slice(0, 7)

      const income = transactions
        .filter((item) => item.type === 'income' && item.date.startsWith(monthKey))
        .reduce((sum, item) => sum + item.amount, 0)

      const expense = transactions
        .filter((item) => item.type === 'expense' && item.date.startsWith(monthKey))
        .reduce((sum, item) => sum + item.amount, 0)

      return {
        label: date.toLocaleString('ru-RU', { month: 'short' }),
        income,
        expense,
      }
    })

    const maxValue = Math.max(...entries.map((entry) => Math.max(entry.income, entry.expense)), 1)

    return entries.map((entry) => ({
      ...entry,
      incomeHeight: (entry.income / maxValue) * 100,
      expenseHeight: (entry.expense / maxValue) * 100,
    }))
  }, [transactions])

  const handleChange = (event) => {
    const { name, value } = event.target
    setForm((current) => ({ ...current, [name]: value }))
  }

  const expenseCategoryChoices = useMemo(() => getCategoryChoicesByType(categories, 'expense'), [categories])
  const incomeCategoryChoices = useMemo(() => getCategoryChoicesByType(categories, 'income'), [categories])

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

    setReportForm((current) => {
      const next = { ...current, [name]: value }

      if (name === 'type' && !isCategoryAllowedForType(current.category, value, categories)) {
        next.category = 'all'
      }

      return next
    })
  }

  const applyReportPreset = (preset) => {
    if (preset === '7d') {
      setReportForm((current) => ({ ...current, ...getLastDaysRange(7), category: 'all', member: 'all', type: 'all' }))
      return
    }

    if (preset === '30d') {
      setReportForm((current) => ({ ...current, ...getLastDaysRange(30), category: 'all', member: 'all', type: 'all' }))
      return
    }

    if (preset === 'month') {
      setReportForm((current) => ({ ...current, ...getMonthRange(), category: 'all', member: 'all', type: 'all' }))
    }
  }

  const resetReportFilter = () => {
    setReportForm({ ...getLastWeekRange(), type: 'all', category: 'all', member: 'all' })
  }

  const handleOperationsFilterChange = (event) => {
    const { name, value } = event.target

    setOperationsFilter((current) => {
      const next = { ...current, [name]: value }

      if (name === 'type' && !isCategoryAllowedForType(current.category, value, categories)) {
        next.category = 'all'
      }

      return next
    })
  }

  const handlePlannedFilterChange = (event) => {
    const { name, value } = event.target
    setPlannedFilter((current) => ({ ...current, [name]: value }))
  }

  const applyOperationsPreset = (preset) => {
    if (preset === '7d') {
      setOperationsFilter((current) => ({ ...current, ...getLastDaysRange(7), category: 'all', member: 'all', type: 'all' }))
      return
    }

    if (preset === '30d') {
      setOperationsFilter((current) => ({ ...current, ...getLastDaysRange(30), category: 'all', member: 'all', type: 'all' }))
      return
    }

    if (preset === 'month') {
      setOperationsFilter((current) => ({ ...current, ...getMonthRange(), category: 'all', member: 'all', type: 'all' }))
    }
  }

  const resetOperationsFilter = () => {
    setOperationsFilter({ ...getLastWeekRange(), type: 'all', category: 'all', member: 'all' })
  }

  const handlePlannedPurchaseChange = (event) => {
    const { name, value } = event.target
    setPlannedPurchaseForm((current) => ({ ...current, [name]: value }))
  }

  const handleBudgetChange = (event) => {
    const { name, value } = event.target
    setBudgetForm((current) => ({ ...current, [name]: value }))
  }

  const handleQuickExpenseInput = (event) => {
    const { name, value } = event.target
    setQuickExpenseForm((current) => ({ ...current, [name]: value }))
  }

  const openQuickExpense = () => {
    const defaultMember = familyMembers[0]?.id || ''
    const defaultExpenseCategory = expenseCategoryChoices[0]?.name || defaultCategories[0]

    setQuickExpenseMemberId(defaultMember)
    setQuickExpenseCategory(defaultExpenseCategory)
    setQuickExpenseForm({
      description: '',
      amount: '',
      date: new Date().toISOString().slice(0, 10),
    })
    setQuickExpenseStep('member')
    setQuickExpenseOpen(true)
  }

  const handleQuickExpenseSubmit = async (event) => {
    event.preventDefault()

    if (!user || !familyContext?.familyId) {
      setError('Сначала войдите в аккаунт.')
      return
    }

    if (!quickExpenseMemberId) {
      setError('Выберите члена семьи.')
      return
    }

    if (!quickExpenseCategory) {
      setError('Выберите категорию.')
      return
    }

    if (!quickExpenseForm.description.trim() || !Number(quickExpenseForm.amount) || Number(quickExpenseForm.amount) <= 0) {
      setError('Введите описание и сумму больше нуля.')
      return
    }

    try {
      await saveTransaction(
        {
          description: quickExpenseForm.description,
          amount: quickExpenseForm.amount,
          category: quickExpenseCategory,
          familyMemberId: quickExpenseMemberId,
          date: quickExpenseForm.date,
          type: 'expense',
        },
        familyContext.familyId,
        user.uid,
      )

      setQuickExpenseOpen(false)
      setQuickExpenseStep('member')
      setQuickExpenseMemberId('')
      setQuickExpenseCategory(expenseCategoryChoices[0]?.name || defaultCategories[0])
      setQuickExpenseForm({
        description: '',
        amount: '',
        date: new Date().toISOString().slice(0, 10),
      })
      setError('')
    } catch (submitError) {
      setError(submitError.message)
    }
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
      const transaction = { ...form, type: 'expense' }
      if (transactionEditingId) {
        await updateTransaction(transactionEditingId, transaction, familyContext.familyId)
      } else {
        await saveTransaction(transaction, familyContext.familyId, user.uid)
      }
      setForm(initialForm)
      setTransactionEditingId('')
    } catch (submitError) {
      setError(submitError.message)
    } finally {
      setSaving(false)
    }
  }

  const handleEditTransaction = (transaction) => {
      const commonFields = {
        description: transaction.description,
        amount: String(transaction.amount),
        familyMemberId: transaction.familyMemberId || '',
        date: transaction.date,
      }

      if (transaction.type === 'expense') {
        setForm({ ...commonFields, category: transaction.category })
        setActiveTab('overview')
      } else if (transaction.type === 'income') {
        setIncomeForm(commonFields)
        setActiveTab('income')
      } else {
        setTransferForm({ ...commonFields, transferToMemberId: transaction.transferToMemberId || '' })
        setActiveTab('income')
      }

      setTransactionEditingId(transaction.id)
      setError('')
    }

  const handleDeleteTransaction = async (transactionId) => {
      if (!window.confirm('Удалить эту операцию?')) {
        return
      }

      try {
        await deleteTransaction(transactionId, familyContext.familyId)
      } catch (submitError) {
        setError(submitError.message)
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
        const transaction = { ...incomeForm, type: 'income', category: 'Salary' }
        if (transactionEditingId) {
          await updateTransaction(transactionEditingId, transaction, familyContext.familyId)
        } else {
          await saveTransaction(transaction, familyContext.familyId, user.uid)
        }
        setIncomeForm(initialIncomeForm)
        setTransactionEditingId('')
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
        const transaction = { ...transferForm, type: 'transfer', category: 'Transfer' }
        if (transactionEditingId) {
          await updateTransaction(transactionEditingId, transaction, familyContext.familyId)
        } else {
          await saveTransaction(transaction, familyContext.familyId, user.uid)
        }
        setTransferForm(initialTransferForm)
        setTransactionEditingId('')
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

  const handleJoinFamily = async (event) => {
      event.preventDefault()
      try {
        const joinedFamily = await joinFamily(user.uid, joinCode)
        setFamilyMessage(`Вы присоединились к семье «${joinedFamily.familyName}». Перезагрузите страницу.`)
        setJoinCode('')
      } catch (submitError) {
        setFamilyMessage(submitError.message)
      }
    }

  const handleLinkFamilyMember = async (event) => {
      event.preventDefault()
      try {
        await linkUserToFamilyMember(selectedFamilyMemberId, user.uid)
        setFamilyContext((current) => ({ ...current, familyMemberId: selectedFamilyMemberId }))
        setFamilyMessage('Пользователь связан с записью члена семьи.')
      } catch (submitError) {
        setFamilyMessage(submitError.message)
    }
  }

  const handleAddMember = async (event) => {
    event.preventDefault()

    if (!memberForm.trim()) {
      return
    }

    try {
      if (memberEditingId) {
        await updateFamilyMember(memberEditingId, familyContext.familyId, memberForm)
      } else {
        await addFamilyMember(familyContext.familyId, memberForm)
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
        await updateCategory(categoryEditingId, familyContext.familyId, categoryForm, categoryType)
      } else {
        await addCategory(familyContext.familyId, categoryForm, categoryType)
      }
      setCategoryForm('')
      setCategoryType('expense')
      setCategoryEditingId('')
    } catch (submitError) {
      setError(submitError.message)
    }
  }

  const handleEditCategory = (category) => {
    setCategoryEditingId(category.id)
    setCategoryForm(category.name)
    setCategoryType(category.type || 'expense')
  }

  const handleDeleteCategory = async (categoryId) => {
    try {
      await deleteCategory(categoryId)
    } catch (submitError) {
      setError(submitError.message)
    }
  }

  const handleAddPlannedPurchase = async (event) => {
    event.preventDefault()

    if (!familyContext?.familyId) {
      setError('Сначала войдите в аккаунт и создайте семью.')
      return
    }

    try {
      if (plannedPurchaseEditingId) {
        await updatePlannedPurchase(plannedPurchaseEditingId, familyContext.familyId, plannedPurchaseForm)
      } else {
        await addPlannedPurchase(familyContext.familyId, plannedPurchaseForm)
      }

      setPlannedPurchaseForm(initialPlannedPurchaseForm)
      setPlannedPurchaseEditingId('')
    } catch (submitError) {
      setError(submitError.message)
    }
  }

  const handleEditPlannedPurchase = (purchase) => {
    setPlannedPurchaseEditingId(purchase.id)
    setPlannedPurchaseForm({
      title: purchase.title,
      amount: String(purchase.amount),
      category: purchase.category,
      plannedDate: purchase.plannedDate,
      notes: purchase.notes || '',
    })
    setActiveTab('planned')
  }

  const handleDeletePlannedPurchase = async (purchaseId) => {
    try {
      await deletePlannedPurchase(purchaseId)
    } catch (submitError) {
      setError(submitError.message)
    }
  }

  const handleBudgetSubmit = async (event) => {
    event.preventDefault()

    try {
      if (budgetEditingId) {
        await updateBudget(budgetEditingId, familyContext.familyId, budgetForm)
      } else {
        await addBudget(familyContext.familyId, budgetForm)
      }

      setBudgetForm(initialBudgetForm)
      setBudgetEditingId('')
    } catch (submitError) {
      setError(submitError.message)
    }
  }

  const handleEditBudget = (budget) => {
    setBudgetEditingId(budget.id)
    setBudgetForm({
      category: budget.category,
      month: budget.month,
      amount: String(budget.amount),
    })
    setActiveTab('budget')
  }

  const handleDeleteBudget = async (budgetId) => {
    try {
      await deleteBudget(budgetId)
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
        <div className="brand-block">
          <div className="brand-mark" aria-hidden="true">Z</div>
          <div className="brand-copy">
            <span className="brand-kicker">FAMILY CASH</span>
            <span className="brand-name">ZFAMILYCASH</span>
          </div>
        </div>

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

        {user && (
          <>
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

            {familyMembers.length > 0 && (
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
          </>
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
              className={activeTab === 'operations' ? 'menu-button active' : 'menu-button'}
              onClick={() => setActiveTab('operations')}
            >
              Управление операциями
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
            <button
              type="button"
              className={activeTab === 'budget' ? 'menu-button active' : 'menu-button'}
              onClick={() => setActiveTab('budget')}
            >
              Бюджет
            </button>
            <button
              type="button"
              className={activeTab === 'planned' ? 'menu-button active' : 'menu-button'}
              onClick={() => setActiveTab('planned')}
            >
              Планы покупок
            </button>
            <button
              type="button"
              className={activeTab === 'history' ? 'menu-button active' : 'menu-button'}
              onClick={() => setActiveTab('history')}
            >
              История доработок
            </button>
          </div>
        )}
      </aside>

      <main className="panel content-panel">
        {user && activeTab === 'overview' && (
          <>
            <section className="form-section">
              <div className="quick-expense-header">
                <h2>{transactionEditingId ? 'Изменить расход' : 'Добавить расход'}</h2>
                <button type="button" className="quick-expense-button" onClick={openQuickExpense}>
                  Быстрый расход
                </button>
              </div>

              {error && <div className="notice error">{error}</div>}

              {quickExpenseOpen && (
                <div className="quick-expense-wizard">
                  {quickExpenseStep === 'member' && (
                    <>
                      <div className="wizard-header">
                        <h3>Кто тратил?</h3>
                        <button type="button" className="ghost-button small" onClick={() => setQuickExpenseOpen(false)}>
                          Закрыть
                        </button>
                      </div>

                      <div className="member-choice-grid">
                        {familyMembers.map((member) => (
                          <button
                            key={member.id}
                            type="button"
                            className={quickExpenseMemberId === member.id ? 'member-choice active' : 'member-choice'}
                            onClick={() => {
                              setQuickExpenseMemberId(member.id)
                              setQuickExpenseStep('category')
                            }}
                          >
                            {member.name}
                          </button>
                        ))}
                      </div>
                    </>
                  )}

                  {quickExpenseStep === 'category' && (
                    <>
                      <div className="wizard-header">
                        <button type="button" className="ghost-button small" onClick={() => setQuickExpenseStep('member')}>
                          Назад
                        </button>
                        <h3>Выберите категорию</h3>
                      </div>

                      <div className="member-choice-grid">
                        {expenseCategoryChoices.map((category) => (
                          <button
                            key={category.id}
                            type="button"
                            className={quickExpenseCategory === category.name ? 'member-choice active' : 'member-choice'}
                            onClick={() => {
                              setQuickExpenseCategory(category.name)
                              setQuickExpenseStep('form')
                            }}
                          >
                            {category.name}
                          </button>
                        ))}
                      </div>
                    </>
                  )}

                  {quickExpenseStep === 'form' && (
                    <form className="transaction-form quick-expense-form" onSubmit={handleQuickExpenseSubmit}>
                      <div className="wizard-header">
                        <button type="button" className="ghost-button small" onClick={() => setQuickExpenseStep('category')}>
                          Назад
                        </button>
                        <h3>Новая трата</h3>
                      </div>

                      <div className="mini-summary">
                        <span>{familyMembers.find((member) => member.id === quickExpenseMemberId)?.name || 'Член семьи'}</span>
                        <span>•</span>
                        <span>{quickExpenseCategory}</span>
                      </div>

                      <label>
                        Дата
                        <input name="date" type="date" value={quickExpenseForm.date} onChange={handleQuickExpenseInput} />
                      </label>

                      <label>
                        Описание
                        <input
                          name="description"
                          value={quickExpenseForm.description}
                          onChange={handleQuickExpenseInput}
                          placeholder="Например: Продукты"
                        />
                      </label>

                      <label>
                        Сумма
                        <input
                          ref={amountInputRef}
                          name="amount"
                          type="number"
                          min="0.01"
                          step="0.01"
                          value={quickExpenseForm.amount}
                          onChange={handleQuickExpenseInput}
                          placeholder="0.00"
                        />
                      </label>

                      <button type="submit" disabled={!firebaseReady}>Добавить расход</button>
                    </form>
                  )}
                </div>
              )}

              <div className="smart-budget-panel">
                <div className="smart-budget-header">
                  <div>
                    <span className="eyebrow small">Умный бюджет</span>
                    <h3>Семейная финансовая сводка</h3>
                  </div>
                </div>

                <div className="smart-budget-grid">
                  <div className="smart-budget-card accent">
                    <span>Плановые траты</span>
                    <strong>{plannedOverview.soon} шт.</strong>
                    <small>в ближайшие 30 дней</small>
                  </div>

                  <div className="smart-budget-card">
                    <span>Лимит месяца</span>
                    <strong>
                      {budgetInsights.totalBudget.toLocaleString('ru-RU', { style: 'currency', currency: 'RUB' })}
                    </strong>
                    <small>всего назначено</small>
                  </div>

                  <div className="smart-budget-card warning">
                    <span>Риск по лимитам</span>
                    <strong>{budgetInsights.risks.length}</strong>
                    <small>категорий уже в минусе</small>
                  </div>
                </div>

                {budgetInsights.rows.length > 0 && (
                  <div className="smart-budget-list">
                    {budgetInsights.rows.slice(0, 3).map((item) => (
                      <div key={item.category} className="smart-budget-item">
                        <div className="smart-budget-item-head">
                          <strong>{item.category}</strong>
                          <span className={item.remaining < 0 ? 'warning-text' : 'ok-text'}>
                            {item.remaining >= 0
                              ? `Остаток ${item.remaining.toLocaleString('ru-RU', { style: 'currency', currency: 'RUB' })}`
                              : `Превышение ${Math.abs(item.remaining).toLocaleString('ru-RU', { style: 'currency', currency: 'RUB' })}`}
                          </span>
                        </div>
                        <div className="smart-budget-bar-track">
                          <div
                            className="smart-budget-bar-fill"
                            style={{
                              width: `${item.limit ? Math.min((item.spent / item.limit) * 100, 100) : 0}%`,
                              background: item.remaining < 0 ? 'linear-gradient(90deg, #fbbf24, #ef4444)' : 'linear-gradient(90deg, #34d399, #22c55e)',
                            }}
                          />
                        </div>
                        <small>
                          Потрачено {item.spent.toLocaleString('ru-RU', { style: 'currency', currency: 'RUB' })} / Лимит {item.limit.toLocaleString('ru-RU', { style: 'currency', currency: 'RUB' })}
                        </small>
                      </div>
                    ))}
                  </div>
                )}

                {budgetInsights.soonest.length > 0 && (
                  <div className="smart-budget-upcoming">
                    <h4>Ближайшие покупки</h4>
                    <ul>
                      {budgetInsights.soonest.map((item) => (
                        <li key={item.id}>
                          <span>{item.title}</span>
                          <strong>{new Date(item.plannedDate).toLocaleDateString('ru-RU')}</strong>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              <div className="family-insight-row">
                <div className="insight-panel">
                  <div className="insight-header">
                    <h4>Календарь оплат</h4>
                    <span>следующие 30 дней</span>
                  </div>

                  {paymentCalendar.length === 0 ? (
                    <p className="empty-state compact">Плановых покупок на ближайшие 30 дней нет.</p>
                  ) : (
                    <ul className="payment-list">
                      {paymentCalendar.map((item) => (
                        <li key={item.id}>
                          <div>
                            <strong>{item.title}</strong>
                            <small>{item.category}</small>
                          </div>
                          <div className="payment-meta">
                            <span>{item.diffDays === 0 ? 'Сегодня' : `через ${item.diffDays} д.`}</span>
                            <strong>{Number(item.amount).toLocaleString('ru-RU', { style: 'currency', currency: 'RUB' })}</strong>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="insight-panel">
                  <div className="insight-header">
                    <h4>Рекомендации</h4>
                    <span>по бюджету</span>
                  </div>

                  <ul className="advice-list">
                    {spendingAdvice.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              </div>

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
                      {expenseCategoryChoices.map((category) => (
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
                  {saving ? 'Сохранение...' : transactionEditingId ? 'Сохранить изменения' : 'Добавить расход'}
                </button>
                {transactionEditingId && (
                  <button
                    type="button"
                    className="ghost-button"
                    onClick={() => {
                      setForm(initialForm)
                      setTransactionEditingId('')
                    }}
                  >
                    Отмена
                  </button>
                )}
              </form>
            </section>
          </>
        )}

        {user && activeTab === 'operations' && (
          <section className="reference-block">
            <div className="reference-header">
              <h2>Управление операциями</h2>
              <p className="field-hint">Фильтры по периоду, типу, категории и участнику помогают найти нужную операцию среди больших списков.</p>
            </div>

            {error && <div className="notice error">{error}</div>}

            <form className="report-form filter-form">
              <div className="filter-toolbar">
                <button type="button" className="filter-button" onClick={() => applyOperationsPreset('7d')}>
                  За 7 дней
                </button>
                <button type="button" className="filter-button" onClick={() => applyOperationsPreset('30d')}>
                  За 30 дней
                </button>
                <button type="button" className="filter-button" onClick={() => applyOperationsPreset('month')}>
                  За месяц
                </button>
                <button type="button" className="filter-button reset" onClick={resetOperationsFilter}>
                  Сбросить фильтр
                </button>
              </div>

              <div className="field-row">
                <label>
                  Дата с
                  <input type="date" name="startDate" value={operationsFilter.startDate} onChange={handleOperationsFilterChange} />
                </label>

                <label>
                  Дата по
                  <input type="date" name="endDate" value={operationsFilter.endDate} onChange={handleOperationsFilterChange} />
                </label>
              </div>

              <div className="field-row">
                <label>
                  Тип
                  <select name="type" value={operationsFilter.type} onChange={handleOperationsFilterChange}>
                    <option value="all">Все</option>
                    <option value="income">Доход</option>
                    <option value="expense">Расход</option>
                    <option value="transfer">Передача</option>
                  </select>
                </label>

                <label>
                  Категория
                  <select name="category" value={operationsFilter.category} onChange={handleOperationsFilterChange}>
                    <option value="all">Все</option>
                    {getCategoryChoicesByType(categories, operationsFilter.type === 'income' ? 'income' : 'expense').map((category) => (
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
                  <select name="member" value={operationsFilter.member} onChange={handleOperationsFilterChange}>
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

            {filteredOperations.length === 0 ? (
              <p className="empty-state">Ни одной операции по выбранным фильтрам не найдено.</p>
            ) : (
              <ul className="transaction-list">
                {filteredOperations.map((transaction) => (
                  <li key={transaction.id} className={transaction.type}>
                    <div>
                      <strong>{transaction.description}</strong>
                      <small>
                        {transaction.category} • {getTransactionMembers(transaction)} • {transaction.date}
                      </small>
                    </div>
                    <div className="reference-actions">
                      <span>
                        {getTransactionSign(transaction)}
                        {transaction.amount.toLocaleString('ru-RU', { style: 'currency', currency: 'RUB' })}
                      </span>
                      <button type="button" onClick={() => handleEditTransaction(transaction)}>
                        Изменить
                      </button>
                      <button type="button" className="danger" onClick={() => handleDeleteTransaction(transaction.id)}>
                        Удалить
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
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
                <button type="submit" disabled={saving || !firebaseReady}>                {saving ? 'Сохранение...' : transactionEditingId ? 'Сохранить доход' : 'Добавить доход'}</button>
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
                <button type="submit" disabled={saving || !firebaseReady}>{saving ? 'Сохранение...' : transactionEditingId ? 'Сохранить передачу' : 'Добавить передачу'}</button>
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
              <select value={categoryType} onChange={(event) => setCategoryType(event.target.value)}>
                <option value="expense">Расход</option>
                <option value="income">Доход</option>
              </select>
              <button type="submit">{categoryEditingId ? 'Сохранить' : 'Добавить'}</button>
              {categoryEditingId && (
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => {
                    setCategoryEditingId('')
                    setCategoryForm('')
                    setCategoryType('expense')
                  }}
                >
                  Отмена
                </button>
              )}
            </form>

            <ul className="reference-list">
              {categories.map((category) => (
                <li key={category.id}>
                  <span>
                    {category.name} <small>({category.type === 'income' ? 'Доход' : 'Расход'})</small>
                  </span>
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

            <div className="settings-group">
              <h3>{familyContext?.familyName || 'Семья'}</h3>
              <p className="field-hint">
                Код приглашения: <strong>{familyContext?.inviteCode || '—'}</strong>
              </p>
              <p className="field-hint">
                Передайте этот код взрослому пользователю, чтобы объединить аккаунты в одну семью.
              </p>
              <form className="reference-form" onSubmit={handleJoinFamily}>
                <input
                  value={joinCode}
                  onChange={(event) => setJoinCode(event.target.value.toUpperCase())}
                  placeholder="Код другой семьи"
                  maxLength="6"
                />
                <button type="submit">Присоединиться</button>
              </form>
              <form className="reference-form" onSubmit={handleLinkFamilyMember}>
                <label>
                  Моя запись в семье
                  <select
                    value={selectedFamilyMemberId || familyContext?.familyMemberId || ''}
                    onChange={(event) => setSelectedFamilyMemberId(event.target.value)}
                  >
                    <option value="">Выберите запись</option>
                    {familyMembers.map((member) => (
                      <option key={member.id} value={member.id}>
                        {member.name}
                      </option>
                    ))}
                  </select>
                </label>
                <button type="submit">Связать с пользователем</button>
              </form>
              {familyMessage && <div className="notice">{familyMessage}</div>}
            </div>
          </section>
        )}

        {user && activeTab === 'planned' && (
          <section className="reference-block">
            <div className="reference-header">
              <h2>Планы покупок</h2>
              <p className="field-hint">По умолчанию показываем покупки на ближайшую неделю вперёд; можно изменить период вручную.</p>
            </div>

            {error && <div className="notice error">{error}</div>}

            <form className="report-form filter-form">
              <div className="filter-toolbar">
                <button type="button" className="filter-button" onClick={() => setPlannedFilter(getNextWeekRange())}>
                  На неделю вперёд
                </button>
                <button type="button" className="filter-button" onClick={() => setPlannedFilter({ startDate: getDateISO(new Date()), endDate: getDateISO(new Date(new Date().getTime() + 30 * 24 * 60 * 60 * 1000)) })}>
                  На 30 дней
                </button>
                <button type="button" className="filter-button" onClick={() => setPlannedFilter({ startDate: getDateISO(new Date()), endDate: getDateISO(new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0)) })}>
                  На месяц
                </button>
                <button type="button" className="filter-button reset" onClick={() => setPlannedFilter(getNextWeekRange())}>
                  Сбросить фильтр
                </button>
              </div>

              <div className="field-row">
                <label>
                  На дату с
                  <input type="date" name="startDate" value={plannedFilter.startDate} onChange={handlePlannedFilterChange} />
                </label>

                <label>
                  По дату
                  <input type="date" name="endDate" value={plannedFilter.endDate} onChange={handlePlannedFilterChange} />
                </label>
              </div>
            </form>

            <div className="plan-overview">
              <div className="plan-stat">
                <span>Всего в периоде</span>
                <strong>
                  {plannedFilterTransactions
                    .reduce((sum, item) => sum + Number(item.amount || 0), 0)
                    .toLocaleString('ru-RU', { style: 'currency', currency: 'RUB' })}
                </strong>
              </div>
              <div className="plan-stat">
                <span>Покупок</span>
                <strong>{plannedFilterTransactions.length}</strong>
              </div>
              <div className="plan-stat">
                <span>Скоро</span>
                <strong>
                  {plannedFilterTransactions.filter((item) => {
                    const diffDays = Math.ceil((new Date(item.plannedDate) - new Date()) / (1000 * 60 * 60 * 24))
                    return diffDays >= 0 && diffDays <= 7
                  }).length}
                </strong>
              </div>
            </div>

            <form onSubmit={handleAddPlannedPurchase} className="transaction-form">
              <div className="field-row">
                <label>
                  Что планируете купить
                  <input
                    name="title"
                    value={plannedPurchaseForm.title}
                    onChange={handlePlannedPurchaseChange}
                    placeholder="Например: Новый ноутбук"
                  />
                </label>

                <label>
                  Категория
                  <select name="category" value={plannedPurchaseForm.category} onChange={handlePlannedPurchaseChange}>
                    {expenseCategoryChoices.map((category) => (
                      <option key={category.id} value={category.name}>
                        {category.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="field-row">
                <label>
                  Сумма
                  <input
                    name="amount"
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={plannedPurchaseForm.amount}
                    onChange={handlePlannedPurchaseChange}
                    placeholder="0.00"
                  />
                </label>

                <label>
                  Предполагаемая дата
                  <input
                    name="plannedDate"
                    type="date"
                    value={plannedPurchaseForm.plannedDate}
                    onChange={handlePlannedPurchaseChange}
                  />
                </label>
              </div>

              <label>
                Комментарий
                <input
                  name="notes"
                  value={plannedPurchaseForm.notes}
                  onChange={handlePlannedPurchaseChange}
                  placeholder="Необязательно"
                />
              </label>

              <div className="reference-form-actions">
                <button type="submit" disabled={!firebaseReady}>
                  {plannedPurchaseEditingId ? 'Сохранить план' : 'Добавить план'}
                </button>
                {plannedPurchaseEditingId && (
                  <button
                    type="button"
                    className="ghost-button"
                    onClick={() => {
                      setPlannedPurchaseEditingId('')
                      setPlannedPurchaseForm(initialPlannedPurchaseForm)
                    }}
                  >
                    Отмена
                  </button>
                )}
              </div>
            </form>

            {plannedFilterTransactions.length === 0 ? (
              <p className="empty-state">В выбранном периоде планов покупок нет.</p>
            ) : (
              <ul className="reference-list">
                {plannedFilterTransactions.map((purchase) => {
                  const diffDays = Math.ceil((new Date(purchase.plannedDate) - new Date()) / (1000 * 60 * 60 * 24))
                  const isSoon = diffDays >= 0 && diffDays <= 30

                  return (
                    <li key={purchase.id} className={isSoon ? 'plan-item upcoming' : 'plan-item'}>
                      <div className="plan-summary">
                        <strong>{purchase.title}</strong>
                        <small>
                          {purchase.category} • {purchase.plannedDate}
                        </small>
                        {purchase.notes && <small>{purchase.notes}</small>}
                        {isSoon && <span className="plan-badge">Скоро</span>}
                      </div>
                      <div className="reference-actions">
                        <span>
                          {Number(purchase.amount).toLocaleString('ru-RU', {
                            style: 'currency',
                            currency: 'RUB',
                          })}
                        </span>
                        <button type="button" onClick={() => handleEditPlannedPurchase(purchase)}>
                          Изменить
                        </button>
                        <button type="button" className="danger" onClick={() => handleDeletePlannedPurchase(purchase.id)}>
                          Удалить
                        </button>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>
        )}

        {user && activeTab === 'history' && (
          <section className="reference-block">
            <div className="reference-header">
              <h2>История доработок</h2>
              <p className="field-hint">Полный журнал улучшений и новых функций приложения.</p>
            </div>

            <div className="changelog-list">
              {changelogEntries.map((entry) => (
                <article key={entry.version} className="changelog-card">
                  <div className="changelog-header">
                    <span className="changelog-version">v{entry.version}</span>
                    <time>{entry.date}</time>
                  </div>
                  <h3>{entry.title}</h3>
                  <ul>
                    {entry.items.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </article>
              ))}
            </div>
          </section>
        )}

        {user && activeTab === 'budget' && (
          <section className="reference-block">
            <div className="reference-header">
              <h2>Бюджет по категориям</h2>
              <p className="field-hint">Устанавливайте месячные лимиты и контролируйте, сколько уже фактически потрачено.</p>
            </div>

            {error && <div className="notice error">{error}</div>}

            <form onSubmit={handleBudgetSubmit} className="transaction-form">
              <div className="field-row">
                <label>
                  Категория
                  <select name="category" value={budgetForm.category} onChange={handleBudgetChange}>
                    {expenseCategoryChoices.map((category) => (
                      <option key={category.id} value={category.name}>
                        {category.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  Месяц
                  <input type="month" name="month" value={budgetForm.month} onChange={handleBudgetChange} />
                </label>
              </div>

              <label>
                Лимит
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  name="amount"
                  value={budgetForm.amount}
                  onChange={handleBudgetChange}
                  placeholder="0.00"
                />
              </label>

              <div className="reference-form-actions">
                <button type="submit" className="budget-primary-button" disabled={!firebaseReady}>
                  {budgetEditingId ? 'Сохранить лимит' : 'Добавить лимит'}
                </button>
                {budgetEditingId && (
                  <button
                    type="button"
                    className="budget-secondary-button"
                    onClick={() => {
                      setBudgetEditingId('')
                      setBudgetForm(initialBudgetForm)
                    }}
                  >
                    Отмена
                  </button>
                )}
              </div>
            </form>

            <div className="budget-grid">
              {monthlyBudgetRows.map((row) => {
                const overLimit = row.remaining < 0
                return (
                  <div key={row.category} className={overLimit ? 'budget-card danger' : 'budget-card'}>
                    <div className="budget-topline">
                      <strong>{row.category}</strong>
                      <span>{row.spent.toLocaleString('ru-RU', { style: 'currency', currency: 'RUB' })}</span>
                    </div>
                    <small>
                      Лимит: {row.limit.toLocaleString('ru-RU', { style: 'currency', currency: 'RUB' })}
                    </small>
                    <div className="budget-progress">
                      <div
                        className="budget-progress-bar"
                        style={{ width: `${row.limit ? Math.min((row.spent / row.limit) * 100, 100) : 0}%` }}
                      />
                    </div>
                    <div className="budget-footer">
                      <span>{overLimit ? 'Превышение' : 'Остаток'}</span>
                      <strong>
                        {row.remaining.toLocaleString('ru-RU', { style: 'currency', currency: 'RUB' })}
                      </strong>
                    </div>
                    <div className="budget-actions">
                      <button
                        type="button"
                        className="budget-action-button primary"
                        onClick={() =>
                          handleEditBudget(
                            budgets.find(
                              (item) => item.category === row.category && item.month === budgetForm.month,
                            ) ?? { ...initialBudgetForm, category: row.category, month: budgetForm.month, amount: row.limit },
                          )
                        }
                      >
                        Изменить
                      </button>
                      {budgets.some((item) => item.category === row.category && item.month === budgetForm.month) && (
                        <button
                          type="button"
                          className="budget-action-button danger"
                          onClick={() => {
                            const budget = budgets.find((item) => item.category === row.category && item.month === budgetForm.month)
                            if (budget) handleDeleteBudget(budget.id)
                          }}
                        >
                          Удалить
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </section>
        )}

        {user && activeTab === 'reports' && (
          <section className="reference-block">
            <div className="reference-header">
              <h2>Отчётность</h2>
            </div>

            <form className="report-form filter-form">
              <div className="filter-toolbar">
                <button type="button" className="filter-button" onClick={() => applyReportPreset('7d')}>
                  За 7 дней
                </button>
                <button type="button" className="filter-button" onClick={() => applyReportPreset('30d')}>
                  За 30 дней
                </button>
                <button type="button" className="filter-button" onClick={() => applyReportPreset('month')}>
                  За месяц
                </button>
                <button type="button" className="filter-button reset" onClick={resetReportFilter}>
                  Сбросить фильтр
                </button>
              </div>

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
                    {getCategoryChoicesByType(categories, reportForm.type === 'income' ? 'income' : 'expense').map((category) => (
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

            <div className="charts-grid">
              <div className="chart-panel">
                <h3>Расходы по категориям</h3>
                {categorySpendingRows.length === 0 ? (
                  <p className="empty-state">Нет данных по расходам за выбранный период.</p>
                ) : (
                  <div className="category-bars">
                    {categorySpendingRows.map((row, index) => (
                      <div key={row.category} className="chart-row">
                        <div className="chart-label-row">
                          <span>{row.category}</span>
                          <strong>{row.amount.toLocaleString('ru-RU', { style: 'currency', currency: 'RUB' })}</strong>
                        </div>
                        <div className="chart-track">
                          <div
                            className="chart-fill"
                            style={{
                              width: `${row.percent}%`,
                              background: ['#38bdf8', '#60a5fa', '#34d399', '#fbbf24', '#f472b6', '#a78bfa'][index % 6],
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="chart-panel">
                <h3>Доли расходов</h3>
                {categoryDonutData.length === 0 ? (
                  <p className="empty-state">Нет данных для donut-диаграммы.</p>
                ) : (
                  <div className="donut-wrap">
                    <div className="donut-chart" style={{ background: `conic-gradient(${categoryDonutData.map((segment, index, arr) => {
                      const previous = arr.slice(0, index).reduce((sum, item) => sum + item.percent, 0)
                      return `${segment.color} ${previous}% ${previous + segment.percent}%`
                    }).join(', ')})` }}>
                      <div className="donut-center">
                        <strong>{categoryDonutData[0]?.amount.toLocaleString('ru-RU', { style: 'currency', currency: 'RUB' }) || '0 ₽'}</strong>
                        <span>Лидер</span>
                      </div>
                    </div>
                    <ul className="donut-legend">
                      {categoryDonutData.map((segment) => (
                        <li key={segment.category}>
                          <span className="legend-dot" style={{ background: segment.color }} />
                          <span>{segment.category}</span>
                          <strong>{segment.percent.toFixed(0)}%</strong>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              <div className="chart-panel span-two">
                <h3>Динамика расходов</h3>
                <div className="trend-chart">
                  {monthlyTrend.map((entry) => (
                    <div key={`${entry.label}-${entry.income}-${entry.expense}`} className="trend-column">
                      <div className="trend-bars">
                        <div className="trend-bar income" style={{ height: `${entry.incomeHeight}%` }} />
                        <div className="trend-bar expense" style={{ height: `${entry.expenseHeight}%` }} />
                      </div>
                      <span>{entry.label}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="chart-panel span-two">
                <h3>Сравнение лимита и факта</h3>
                <div className="budget-compare-list">
                  {budgetVsFact.filter((item) => item.limit > 0 || item.spent > 0).map((item) => (
                    <div key={item.category} className="budget-compare-item">
                      <div className="budget-compare-header">
                        <span>{item.category}</span>
                        <strong>{item.remaining.toLocaleString('ru-RU', { style: 'currency', currency: 'RUB' })}</strong>
                      </div>
                      <div className="compare-track">
                        <div
                          className="compare-track-fill"
                          style={{
                            width: `${item.limit ? Math.min((item.spent / item.limit) * 100, 100) : 0}%`,
                            background: item.remaining < 0 ? 'linear-gradient(90deg, #f97316, #ef4444)' : 'linear-gradient(90deg, #34d399, #22c55e)',
                          }}
                        />
                      </div>
                      <div className="compare-meta">
                        <small>Лимит: {item.limit.toLocaleString('ru-RU', { style: 'currency', currency: 'RUB' })}</small>
                        <small>Факт: {item.spent.toLocaleString('ru-RU', { style: 'currency', currency: 'RUB' })}</small>
                      </div>
                    </div>
                  ))}
                </div>
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
