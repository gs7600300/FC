import { useEffect, useMemo, useState } from 'react'
import './App.css'
import { firebaseReady, saveTransaction, subscribeToTransactions } from './firebase'

const initialForm = {
  description: '',
  amount: '',
  type: 'expense',
  category: 'Food',
  date: new Date().toISOString().slice(0, 10),
}

const categories = ['Food', 'Transport', 'Housing', 'Salary', 'Health', 'Shopping', 'Other']

function App() {
  const [form, setForm] = useState(initialForm)
  const [transactions, setTransactions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const unsubscribe = subscribeToTransactions((items) => {
      setTransactions(items)
      setLoading(false)
    })

    return () => unsubscribe()
  }, [])

  const total = useMemo(
    () =>
      transactions.reduce((sum, item) => {
        return item.type === 'income' ? sum + item.amount : sum - item.amount
      }, 0),
    [transactions],
  )

  const handleChange = (event) => {
    const { name, value } = event.target
    setForm((current) => ({ ...current, [name]: value }))
  }

  const handleSubmit = async (event) => {
    event.preventDefault()

    if (!form.description.trim() || !Number(form.amount) || Number(form.amount) <= 0) {
      setError('Введите корректное описание и сумму больше нуля.')
      return
    }

    setSaving(true)
    setError('')

    try {
      await saveTransaction(form)
      setForm(initialForm)
    } catch (submitError) {
      setError(submitError.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="page-shell">
      <aside className="panel summary-panel">
        <p className="eyebrow">Финансовый учёт</p>
        <h1>FC Budget</h1>

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
      </aside>

      <main className="panel content-panel">
        <section className="form-section">
          <h2>Добавить операцию</h2>

          {!firebaseReady && (
            <div className="notice warning">
              Firebase не настроен. Создайте файл .env по примеру .env.example и укажите конфиг проекта.
            </div>
          )}

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
                Тип
                <select name="type" value={form.type} onChange={handleChange}>
                  <option value="expense">Расход</option>
                  <option value="income">Доход</option>
                </select>
              </label>
            </div>

            <div className="field-row">
              <label>
                Категория
                <select name="category" value={form.category} onChange={handleChange}>
                  {categories.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
              </label>

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
              {transactions.map((transaction) => (
                <li key={transaction.id} className={transaction.type === 'income' ? 'income' : 'expense'}>
                  <div>
                    <strong>{transaction.description}</strong>
                    <small>
                      {transaction.category} • {transaction.date}
                    </small>
                  </div>
                  <span>
                    {transaction.type === 'income' ? '+' : '-'}
                    {transaction.amount.toLocaleString('ru-RU', { style: 'currency', currency: 'RUB' })}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  )
}

export default App
