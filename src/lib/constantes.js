// Parâmetros de negócio (JS puro — usado pelo navegador e pelo servidor).

// Exigir agendamento vigente (Agendamento.InspecaoDtInicial..InspecaoDtFinal) para iniciar o formulário.
// No app original somente o GRD bloqueava ("Nenhum agendamento foi realizado para data de hoje!").
// Programas com Plano de Ação (o SGI não tem PA)
export const PROGRAMAS_COM_PA = ["SOL", "GRD"];

export const EXIGIR_AGENDAMENTO = { SOL: false, GRD: true, SGI: false };

// Unidades que não participam da auditoria SGI (filtro da ComboBoxSelecionarUnidade).
export const UNIDADES_SEM_SGI = ["Cascavel", "Cruz Alta", "Cidade Ocidental", "Iracemápolis"];

// E-mail de contato exibido nas telas de erro do Plano de Ação.
export const EMAIL_CONTATO = "programa.sol@icl-group.com";

export const PROGRAMA_INFO = {
  SOL: { titulo: "Inspeção SOL", tituloLongo: "Inspeção do Programa SOL", programa: "Programa SOL (PG00107)", tipoTexto: "inspeção" },
  GRD: { titulo: "Avaliação GRD", tituloLongo: "Avaliação do Programa GRD", programa: "Programa GRD", tipoTexto: "avaliação" },
  SGI: { titulo: "Auditoria SGI", tituloLongo: "Auditoria do Programa SGI", programa: "Programa SGI", tipoTexto: "auditoria" },
};

export const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

export const anosDisponiveis = (anoAtual) => Array.from({ length: 7 }, (_, i) => anoAtual - 6 + i);
