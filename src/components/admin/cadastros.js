// Configuração das telas de cadastro do Admin (ScreenUnidades, ScreenAreas, ScreenInspetores, ScreenAuditores,
// ScreenResponsaveis, ScreenFacilitadores, ScreenGestores, ScreenLideres, ScreenNormaResponsaveisSgi,
// ScreenTipoAvaliacao, ScreenItens e ScreenQuestoesAuditoria).
// tipo: text | email | textarea | number | select | bool. fonte: entidade usada para montar as opções do select.
// unico: campo(s) que identificam o registro na importação por Excel — linha com a mesma chave de um registro existente o atualiza; senão, cria.

const pessoa = (titulo, descricao) => ({
  titulo,
  descricao,
  ordenar: "Nome",
  unico: "Email",
  busca: ["Nome", "Email", "Cargo"],
  campos: [
    { nome: "Nome", rotulo: "Nome", obrigatorio: true },
    { nome: "Email", rotulo: "E-mail", tipo: "email", obrigatorio: true },
    { nome: "Cargo", rotulo: "Cargo", obrigatorio: true },
  ],
  colunas: ["Nome", "Email", "Cargo"],
});

export const CADASTROS = {
  Unidade: {
    titulo: "Unidades", ordenar: "Nome", unico: "Nome", busca: ["Nome", "Sigla", "GestorIndustrial"],
    campos: [
      { nome: "Nome", rotulo: "Nome", obrigatorio: true },
      { nome: "Sigla", rotulo: "Sigla", obrigatorio: true, ajuda: "Usada nas planilhas SOL/GRD" },
      { nome: "Escopo", rotulo: "Escopo" },
      { nome: "GestorIndustrial", rotulo: "E-mail do Gestor Industrial", tipo: "email" },
    ],
    colunas: ["Nome", "Sigla", "Escopo", "GestorIndustrial"],
  },
  Area: {
    titulo: "Áreas", ordenar: "Nome", unico: "Nome", busca: ["Nome", "Sigla"],
    campos: [{ nome: "Nome", rotulo: "Nome", obrigatorio: true }, { nome: "Sigla", rotulo: "Sigla", obrigatorio: true }],
    colunas: ["Nome", "Sigla"],
  },
  Processo: {
    titulo: "Processos", ordenar: "Nome", unico: "Nome", busca: ["Nome"],
    campos: [{ nome: "Nome", rotulo: "Nome", obrigatorio: true }],
    colunas: ["Nome"],
  },
  Inspetor: {
    titulo: "Inspetores", descricao: "Inspetores SOL e avaliadores GRD. O e-mail dá acesso ao app de Inspeção.", ordenar: "Nome", unico: "Email", busca: ["Nome", "Email"],
    campos: [
      { nome: "Nome", rotulo: "Nome", obrigatorio: true },
      { nome: "Email", rotulo: "E-mail", tipo: "email", obrigatorio: true },
      { nome: "AreaId", rotulo: "Área", tipo: "select", fonte: "Area", obrigatorio: true },
    ],
    colunas: ["Nome", "Email", "AreaId"],
  },
  Auditor: {
    ...pessoa("Auditores", "Auditores das auditorias SGI. O e-mail dá acesso ao app de Inspeção."),
    campos: [...pessoa().campos, { nome: "Tipo", rotulo: "Tipo", tipo: "select", opcoes: ["Interno", "Externo"] }],
    colunas: ["Nome", "Email", "Cargo", "Tipo"],
  },
  Responsavel: pessoa("Responsáveis (SOL)", "Recebem o e-mail e preenchem o plano de ação das inspeções SOL das áreas vinculadas."),
  Facilitador: pessoa("Facilitadores (SOL)", "Recebem o e-mail e preenchem o plano de ação das inspeções SOL das áreas vinculadas."),
  Gestor: pessoa("Gestores (GRD)", "Recebem o e-mail e preenchem o plano de ação das avaliações GRD das áreas vinculadas."),
  Lider: pessoa("Líderes (GRD)", "Recebem o e-mail e preenchem o plano de ação das avaliações GRD das áreas vinculadas."),
  ResponsavelSgi: pessoa("Responsáveis SGI", "Responsáveis pelas áreas auditadas no SGI."),
  TipoDeInspecao: {
    titulo: "Tipos de Inspeção", descricao: "Ex.: 1ª Inspeção, 2ª Avaliação, Diagnóstico. Usados no Agendamento.", ordenar: "Tipo", unico: ["Tipo", "Programa"], busca: ["Tipo", "Descricao"],
    campos: [
      { nome: "Tipo", rotulo: "Tipo", obrigatorio: true },
      { nome: "Descricao", rotulo: "Descrição" },
      { nome: "Programa", rotulo: "Formulário", tipo: "select", opcoes: ["SOL", "GRD", "SGI"], obrigatorio: true },
    ],
    colunas: ["Tipo", "Descricao", "Programa"],
  },
  ItemSol: {
    titulo: "Itens do Checklist SOL", unico: "Requisito", descricao: "Categorias: E = Empresa, C = Colaborador, S = Segurança, C/S = Colaborador e Segurança.", ordenar: "Ordem", busca: ["Requisito", "Subcategoria"],
    campos: [
      { nome: "Ordem", rotulo: "Ordem", tipo: "number", obrigatorio: true },
      { nome: "Requisito", rotulo: "Requisito", tipo: "textarea", obrigatorio: true },
      { nome: "Categoria", rotulo: "Categoria", tipo: "select", opcoes: ["E", "C", "S", "C/S"], obrigatorio: true },
      { nome: "Subcategoria", rotulo: "Subcategoria", obrigatorio: true },
      { nome: "Ativo", rotulo: "Ativo", tipo: "bool" },
    ],
    colunas: ["Ordem", "Requisito", "Categoria", "Subcategoria", "Ativo"],
  },
  ItemSgi: {
    titulo: "Questões Auditoria SGI", unico: "Questao", descricao: "A questão entra na auditoria quando é da área auditada (ou sem área) e possui conteúdo em alguma norma selecionada.", ordenar: "Ordem", busca: ["Questao", "Procedimento", "Area"],
    campos: [
      { nome: "Ordem", rotulo: "Ordem", tipo: "number" },
      { nome: "Questao", rotulo: "Questão", tipo: "textarea", obrigatorio: true },
      { nome: "Procedimento", rotulo: "Procedimento" },
      { nome: "Area", rotulo: "Área (vazio = todas)", tipo: "select", fonte: "Area", valor: "Nome" },
      { nome: "ISO9001", rotulo: "ISO 9001" },
      { nome: "ISO14001", rotulo: "ISO 14001" },
      { nome: "ISO45001", rotulo: "ISO 45001" },
      { nome: "LOTOTO", rotulo: "LOTOTO" },
      { nome: "PROCESSO", rotulo: "PROCESSO" },
      { nome: "CAPA", rotulo: "CAPA" },
      { nome: "Ativo", rotulo: "Ativo", tipo: "bool" },
    ],
    colunas: ["Ordem", "Questao", "Area", "Procedimento", "Ativo"],
  },
};

export const ROTULO_COLUNA = { AreaId: "Área", Descricao: "Descrição", Questao: "Questão", Programa: "Formulário", Email: "E-mail", GestorIndustrial: "Gestor Industrial" };
