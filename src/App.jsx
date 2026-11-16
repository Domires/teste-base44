import { useState } from 'react'

export default function App() {
  const [form, setForm] = useState({ nome: '', email: '', mensagem: '' })
  const [enviado, setEnviado] = useState(null)

  function handleChange(e) {
    setForm({ ...form, [e.target.name]: e.target.value })
  }

  function handleSubmit(e) {
    e.preventDefault()
    setEnviado(form)
    setForm({ nome: '', email: '', mensagem: '' })
  }

  return (
    <div className="container">
      <h1>Formulário de Contato</h1>

      <form onSubmit={handleSubmit}>
        <label>
          Nome
          <input name="nome" value={form.nome} onChange={handleChange} required />
        </label>

        <label>
          E-mail
          <input type="email" name="email" value={form.email} onChange={handleChange} required />
        </label>

        <label>
          Mensagem
          <textarea name="mensagem" rows="4" value={form.mensagem} onChange={handleChange} required />
        </label>

        <button type="submit">Enviar</button>
      </form>

      {enviado && (
        <div className="resultado">
          <h2>Dados enviados:</h2>
          <p><strong>Nome:</strong> {enviado.nome}</p>
          <p><strong>E-mail:</strong> {enviado.email}</p>
          <p><strong>Mensagem:</strong> {enviado.mensagem}</p>
        </div>
      )}
    </div>
  )
}
