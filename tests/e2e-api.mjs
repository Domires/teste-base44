// Teste ponta a ponta da API (35 verificações): inspeção SOL/GRD/SGI, regras de acesso, plano de ação e admin.
const B = process.env.API || "http://localhost:3099";
let falhas = 0;
const ok = (c, m) => { console.log(`${c ? "OK  " : "FALHA"} ${m}`); if (!c) falhas++; };

async function login(email) { return email; }
const cli = (tok) => async (name, data) => {
  const r = await fetch(`${B}/api/functions/${name}`, { method: "POST", headers: { "content-type": "application/json", "x-dev-user": tok }, body: JSON.stringify(data || {}) });
  const j = await r.json();
  if (!r.ok) { const e = new Error(j.message); e.status = r.status; throw e; }
  return j.data;
};
const ent = (tok) => async (path, method = "GET", body) => {
  const r = await fetch(`${B}/api/entities/${path}`, { method, headers: { "content-type": "application/json", "x-dev-user": tok }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, body: await r.json() };
};
const hoje = new Date().toISOString().slice(0, 10);
const png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

const admin = cli(await login("admin@sol.local", "admin123"));
const insp = cli(await login("inspetor@sol.local", "123456"));
const tokPre = await login("preenchedor@sol.local", "123456");
const pre = cli(tokPre);
const inspEnt = ent(await login("inspetor@sol.local", "123456"));

const ctx = await insp("contexto");
ok(ctx.isInspetor && !ctx.isAdmin, "contexto do inspetor");
const sel = await insp("inspecao.dadosSelecao");
const prefLoc = (await pre("contexto")) && null;
for (const fn of ["inspecao.dadosSelecao", "inspecao.minhasEmAberto"]) {
  try { await pre(fn); ok(false, `preenchedor não deveria usar ${fn}`); } catch (e) { ok(e.status === 403, `quem não é inspetor/auditor/admin é bloqueado em ${fn}`); }
}
try { await pre("inspecao.abrirFormulario", { programa: "SOL", uapId: sel.locais[0].UnidadeAreaProcessoId }); ok(false, "preenchedor abre formulário"); } catch (e) { ok(e.status === 403, "preenchedor não abre o formulário de inspeção"); }
ok(sel.locais.length > 0, `dados de seleção: ${sel.locais.length} locais`);

// local vinculado ao preenchedor (seed vincula os 3 primeiros locais)
const vinc = await (await fetch(`${B}/api/entities/Vinculo`, { headers: { "x-dev-user": tokPre } })).json();
const uapId = vinc[0].UnidadeAreaProcessoId;

// ---- SOL ----
const fSol = await insp("inspecao.abrirFormulario", { programa: "SOL", uapId });
ok(fSol.checklist.length === 31, `checklist SOL com ${fSol.checklist.length} itens`);
let up = await fetch(`${B}/api/integrations/Core/UploadFile`, { method: "POST", headers: { "content-type": "application/json", "x-dev-user": "inspetor@sol.local" }, body: JSON.stringify({ dataUrl: png }) });
const { file_url } = await up.json();
ok(file_url?.startsWith("/uploads/"), "upload de foto");
const upArq = async (dataUrl, fileName) => fetch(`${B}/api/integrations/Core/UploadFile`, { method: "POST", headers: { "content-type": "application/json", "x-dev-user": "inspetor@sol.local" }, body: JSON.stringify({ dataUrl, fileName }) });
const docx = await (await upArq("data:application/vnd.openxmlformats-officedocument.wordprocessingml.document;base64," + Buffer.from("doc").toString("base64"), "Relatório Final.docx")).json();
ok(/__Relatorio_Final.docx$/.test(docx.file_url || ""), `upload de qualquer tipo de arquivo: ${docx.file_url}`);
const html = await (await upArq("data:text/html;base64," + Buffer.from("<script>alert(1)</script>").toString("base64"), "x.html")).json();
const rHtml = await fetch(`${B}${html.file_url}`);
ok(/attachment/.test(rHtml.headers.get("content-disposition") || "") && rHtml.headers.get("content-type") === "application/octet-stream", "arquivo HTML enviado é só baixado, nunca aberto no app");
const grande = await upArq("data:application/octet-stream;base64," + Buffer.alloc(26 * 1024 * 1024).toString("base64"), "grande.bin");
ok(grande.status === 413, `arquivo acima de 25 MB recusado (${grande.status})`);
const respSol = fSol.checklist.map((i, k) => ({ Id: i.Id, Resposta: k % 5 === 0 ? "Não" : k % 7 === 0 ? "N/A" : "Sim", ItemObservacao: k % 5 === 0 ? "obs" : "", Fotos: k % 5 === 0 ? [file_url] : [] }));
const cabSol = { Data: hoje, RespAcompanhamento: "Fulano", Cargo: "Operador", Inspetor1: "Inspetor Demonstração", Inspetor2: "Segundo Inspetor", Observacao: "" };
try { await insp("inspecao.finalizar", { programa: "SOL", uapId, cabecalho: cabSol, respostas: respSol.map((r) => ({ ...r, Fotos: [] })), assinaturaUrl: file_url }); ok(false, "SOL sem foto deveria falhar"); } catch (e) { ok(/evid/i.test(e.message), `SOL sem foto bloqueado: ${e.message}`); }
const rSol = await insp("inspecao.finalizar", { programa: "SOL", uapId, cabecalho: cabSol, respostas: respSol, assinaturaUrl: file_url });
ok(rSol.id && rSol.resultado.Status, `SOL finalizada: ${rSol.resultado.Status} total=${rSol.resultado.ScoreTotal} emp=${rSol.resultado.ScoreEmpresa} col=${rSol.resultado.ScoreColaborador} seg=${rSol.resultado.ScoreSeguranca}`);

// ---- GRD parcial + continuação + finalizar ----
const v1 = await insp("inspecao.verificarEmAndamento", { programa: "GRD", uapId });
ok(v1.inspecaoId === null && v1.tipoInspecao, `GRD sem andamento, agendamento: ${v1.tipoInspecao}`);
const fGrd = await insp("inspecao.abrirFormulario", { programa: "GRD", uapId });
ok(fGrd.checklist.length === 36 && fGrd.checklist[0].PilarNome === "1º Pilar", `checklist GRD ${fGrd.checklist.length} itens, 1º pilar primeiro`);
const cabGrd = { Data: hoje, RespAcompanhamento: "Ciclano", Cargo: "Líder", Avaliador: "Inspetor Demonstração" };
const metade = fGrd.checklist.slice(0, 10).map((i) => ({ Id: i.Id, Resposta: "Sim", ItemObservacao: "ok" }));
const p1 = await insp("inspecao.salvarParcial", { programa: "GRD", uapId, cabecalho: cabGrd, respostas: metade });
const v2 = await insp("inspecao.verificarEmAndamento", { programa: "GRD", uapId });
ok(v2.inspecaoId === p1.id, "GRD em andamento encontrado");
const fGrd2 = await insp("inspecao.abrirFormulario", { programa: "GRD", uapId, inspecaoId: p1.id });
ok(fGrd2.checklist.filter((i) => i.Resposta).length === 10, "GRD retomado com 10 respostas");
const todas = fGrd2.checklist.map((i, k) => ({ Id: i.Id, Resposta: k % 4 === 0 ? "Não" : "Sim", ItemObservacao: "evidência" }));
const rGrd = await insp("inspecao.finalizar", { programa: "GRD", uapId, inspecaoId: p1.id, cabecalho: cabGrd, respostas: todas, assinaturaUrl: file_url });
ok(rGrd.resultado.Metricas.length === 5, `GRD finalizada: atendimento=${rGrd.resultado.Atendimento} pilares=${rGrd.resultado.Metricas.map((m) => m.Atendimento).join("/")}`);

// ---- SGI ----
const fSgi = await insp("inspecao.abrirFormulario", { programa: "SGI", uapId, normas: ["ISO SGI", "CAPA"] });
ok(fSgi.checklist.length >= 1, `checklist SGI ${fSgi.checklist.length} questões`);
const cabSgi = { Data: hoje, Auditor: "Inspetor Demonstração", EquipeEntrevistada: "a@x.com;b@x.com" };
const pS = await insp("inspecao.salvarParcial", { programa: "SGI", uapId, normas: ["ISO SGI", "CAPA"], cabecalho: cabSgi, respostas: [{ Id: fSgi.checklist[0].Id, Resposta: "Conforme" }] });
const vS = await insp("inspecao.verificarEmAndamento", { programa: "SGI", uapId, normas: ["ISO SGI", "CAPA"] });
ok(vS.ano === Number(hoje.slice(0, 4)) && !!vS.dataAberta, "SGI salvo informa ano e data para o aviso de continuar/nova");
ok(vS.inspecaoId === pS.id, "SGI salvo encontrado pela norma no mesmo ano");
const normasSgi = ["ISO SGI", "CAPA"];
const anoHoje = Number(hoje.slice(0, 4));
try { await insp("inspecao.finalizar", { programa: "SGI", uapId, inspecaoId: pS.id, normas: normasSgi, cabecalho: cabSgi, respostas: [] }); ok(false, "SGI não deveria finalizar"); } catch (e) { ok(/Salvar/.test(e.message), `SGI sem Finalizar: ${e.message}`); }
// mesmas opções no mesmo ano: o mesmo registro é carregado e atualizado (sem duplicar)
const fSgi2 = await insp("inspecao.abrirFormulario", { programa: "SGI", uapId, normas: normasSgi });
ok(fSgi2.inspecao?.id === pS.id && fSgi2.checklist[0].Resposta === "Conforme", "SGI do ano carregado com o que foi salvo");
const rSgi = await insp("inspecao.salvarParcial", { programa: "SGI", uapId, normas: normasSgi, cabecalho: cabSgi, respostas: fSgi.checklist.map((i, k) => ({ Id: i.Id, Resposta: k === 0 ? "Não Conformidade Menor" : "Conforme", DescricaoApontamento: "x" })) });
ok(rSgi.id === pS.id, "salvar de novo no mesmo ano atualiza o mesmo registro");
const regSgi = (await inspEnt(`Inspecao/${pS.id}`)).body;
ok(regSgi.Ano === anoHoje && regSgi.EmAberto === false, `SGI salvo é o registro válido do ano ${regSgi.Ano}`);
// virada de ano (simulada movendo o registro salvo para o ano anterior)
const entAdmin = ent("admin@sol.local");
const anoAnt = anoHoje - 1;
const sgiAnt = (await entAdmin(`Inspecao/${pS.id}`, "PUT", { Ano: anoAnt, Data: `${anoAnt}-06-15` })).body;
ok(sgiAnt.Ano === anoAnt, `registro SGI movido para ${anoAnt}`);
const vNovo = await insp("inspecao.verificarEmAndamento", { programa: "SGI", uapId, normas: normasSgi });
ok(vNovo.inspecaoId === null && vNovo.ano === anoHoje, `ano novo: mesmas opções abrem nova auditoria de ${anoHoje}`);
const fNovo = await insp("inspecao.abrirFormulario", { programa: "SGI", uapId, normas: normasSgi });
ok(!fNovo.inspecao && fNovo.checklist.every((i) => !i.Resposta), "nova auditoria começa em branco");
try { await insp("inspecao.abrirFormulario", { programa: "SGI", uapId, normas: normasSgi, inspecaoId: pS.id }); ok(false, "SGI de ano anterior não deveria abrir para edição"); } catch (e) { ok(new RegExp(String(anoAnt)).test(e.message), `SGI de ${anoAnt} só consulta: ${e.message}`); }
const pNovo = await insp("inspecao.salvarParcial", { programa: "SGI", uapId, normas: normasSgi, cabecalho: cabSgi, respostas: [{ Id: fSgi.checklist[0].Id, Resposta: "Conforme" }] });
ok(pNovo.id !== pS.id, "auditoria do ano novo é um registro separado");
const antiga = (await inspEnt(`Inspecao/${pS.id}`)).body;
ok(antiga.Ano === anoAnt && antiga.Checklist[0].Resposta === "Não Conformidade Menor", `auditoria de ${anoAnt} preservada sem interferência`);
const minhas = await insp("inspecao.minhasEmAberto");
ok(minhas.some((m) => m.id === pNovo.id) && !minhas.some((m) => m.id === pS.id), "lista de continuação mostra só a SGI do ano atual");
try { await insp("inspecao.descartarParcial", { id: pS.id }); ok(false, "SGI de ano anterior não deveria ser descartada"); } catch (e) { ok(/histórico/.test(e.message), `SGI de ano anterior não é descartada: ${e.message}`); }
await insp("inspecao.descartarParcial", { id: pNovo.id });
// devolve o registro antigo ao ano atual para as verificações do admin abaixo
await entAdmin(`Inspecao/${pS.id}`, "PUT", { Ano: anoHoje, Data: hoje });
const vDesc = await insp("inspecao.verificarEmAndamento", { programa: "SGI", uapId, normas: normasSgi });
ok(vDesc.inspecaoId === pS.id, "Nova Avaliação: SGI do ano descartada (a do ano anterior fica no histórico)");

// ---- RLS: inspetor lê só as suas; não lê planos; não cria cadastro ----
const lst = await inspEnt("Inspecao");
ok(lst.status === 200 && lst.body.every((i) => i.InspetorEmail === "inspetor@sol.local"), `RLS Inspecao: inspetor vê ${lst.body.length} registros próprios`);
const cr = await inspEnt("Unidade", "POST", { Nome: "X", Sigla: "X" });
ok(cr.status === 403, "RLS: inspetor não cria Unidade");
try { await insp("admin.indicadores"); ok(false, "inspetor não acessa admin"); } catch (e) { ok(e.status === 403, "inspetor bloqueado no admin"); }
{ // tabela User: ninguém além do admin cria/altera usuários (nem se promove a admin)
  const meu = (await inspEnt("User")).body;
  ok(Array.isArray(meu) && meu.length === 1 && meu[0].email === "inspetor@sol.local", "RLS: não-admin só enxerga o próprio usuário");
  ok((await inspEnt("User", "POST", { email: "intruso@teste.local", role: "admin" })).status === 403, "RLS: não-admin não cria usuário admin");
  ok((await inspEnt(`User/${meu[0]?.id}`, "PUT", { role: "admin" })).status === 403, "RLS: não-admin não se promove a admin");
  ok(!(await insp("contexto")).isAdmin, "inspetor continua sem perfil de admin");
}

// ---- Plano de Ação ----
const lista = await pre("plano.listar", { programa: "SOL" });
const item = lista.find((x) => x.InspecaoId === rSol.id);
ok(item && item.ItensPANaoIniciados > 0, `PA lista: ${item?.ItensPANaoIniciados} não iniciados`);
const ob = await pre("plano.obter", { inspecaoId: rSol.id });
ok(!ob.erro && ob.naoConformes.length === item.ItensPANaoIniciados, "PA obter inspeção");
const ref = ob.naoConformes[0];
try { await pre("plano.salvar", { inspecaoId: rSol.id, itemRef: ref, Acao: "", Data: hoje, Status: "Em andamento" }); ok(false, "PA vazio deveria falhar"); } catch (e) { ok(true, `PA vazio bloqueado: ${e.message}`); }
await pre("plano.salvar", { inspecaoId: rSol.id, itemRef: ref, Acao: "Corrigir", Data: hoje, Status: "Em andamento", RespExec: "João", AreaResponsavel: "Manutenção", Fotos: [file_url] });
const paEd = await pre("plano.salvar", { inspecaoId: rSol.id, itemRef: ref, Acao: "Corrigindo", Data: hoje, Status: "Em andamento", RespExec: "Pedro", AreaResponsavel: "Elétrica", OrdemDeServico: "OS-9", Fotos: [] });
ok(paEd.plano.RespExec === "Pedro" && paEd.plano.AreaResponsavel === "Elétrica" && paEd.plano.OrdemDeServico === "OS-9" && paEd.plano.Fotos.length === 0 && paEd.plano.Responsavel, "PA em andamento: responsável, área, nota e fotos continuam editáveis");
await pre("plano.salvar", { inspecaoId: rSol.id, itemRef: ref, Acao: "Corrigido", Data: hoje, Status: "Finalizado" });
try { await pre("plano.salvar", { inspecaoId: rSol.id, itemRef: ref, Acao: "de novo", Data: hoje, Status: "Em andamento" }); ok(false, "PA finalizado não edita"); } catch (e) { ok(true, `PA finalizado bloqueado: ${e.message}`); }
const lista2 = await pre("plano.listar", { programa: "SOL" });
const it2 = lista2.find((x) => x.InspecaoId === rSol.id);
ok(it2.PlanoDeAcaoFinalizado === 1, "contagem de finalizados atualizada");

// ---- Admin ----
const ind = await admin("admin.indicadores");
ok(ind.TotalInspecao >= 3, `indicadores: ${ind.TotalInspecao} inspeções, ${ind.PlanoDeAcaoFinalizado} PA finalizados`);
const li = await admin("admin.listarInspecoes", { situacao: "ativas", ano: new Date().getFullYear() });
ok(li.length >= 3, `admin lista ${li.length} inspeções`);
const sgiRes = li.find((r) => r.InspecaoId === rSgi.id);
const sgiInd = ind.porPrograma.find((x) => x.programa === "SGI");
ok(sgiRes && sgiRes.TemPlanoDeAcao === false && sgiRes.ItensPANaoIniciados === 0 && !sgiRes.EmAtraso && sgiInd.temPlanoDeAcao === false && sgiInd.naoIniciados === 0 && sgiInd.emAtraso === 0,
  "SGI (com não conformidade) fora das contagens de plano de ação");
const env = await admin("admin.enviarPAInspecao", { id: rSol.id });
ok(env.enviado && env.situacao === "enviado", `e-mail PA enviado por SMTP: ${env.destinatarios.join(",")}`);
const marcada = (await (await fetch(`${B}/api/entities/Inspecao/${rSol.id}`, { headers: { "x-dev-user": "admin@sol.local" } })).json());
ok(marcada.Disparado === true && !!marcada.DataDisparo, "inspeção marcada como e-mail enviado só após envio real");
const ds = await admin("admin.dispararSol", { mes: new Date().getMonth() + 1, ano: new Date().getFullYear(), unidade: null });
ok(ds.total >= 1 && ds.enviados === ds.total - ds.semVinculo && ds.falhas === 0, `disparo SOL: ${ds.enviados}/${ds.total} (sem vínculo: ${ds.semVinculo})`);
// falha do servidor de e-mail numa inspeção: registra a falha, não marca como enviada e o lote continua
// (uma 2ª inspeção SOL do mês, em outro local vinculado, criada DEPOIS da que vai falhar)
const uap2 = vinc.map((v) => v.UnidadeAreaProcessoId).find((x) => x !== uapId);
const fSol2 = await insp("inspecao.abrirFormulario", { programa: "SOL", uapId: uap2 });
const rSol2 = await insp("inspecao.finalizar", { programa: "SOL", uapId: uap2, cabecalho: cabSol, assinaturaUrl: file_url, respostas: fSol2.checklist.map((i) => ({ Id: i.Id, Resposta: "Sim" })) });
const rFalha = await admin("admin.salvarCadastro", { entidade: "Responsavel", dados: { Nome: "Destino Com Falha", Email: "falha-smtp@teste.local", Cargo: "Teste" } });
const vFalha = await admin("admin.vincularPessoa", { uapId, papel: "Responsável", pessoaId: rFalha.id });
const antesFalha = (await (await fetch(`${B}/api/entities/Inspecao/${rSol.id}`, { headers: { "x-dev-user": "admin@sol.local" } })).json()).DataDisparo;
const dsF = await admin("admin.dispararSol", { mes: new Date().getMonth() + 1, ano: new Date().getFullYear(), unidade: null });
const itemF = dsF.resultados.find((r) => r.inspecaoId === rSol.id);
ok(itemF?.situacao === "enviado" && itemF.enviadoPara.length > 0 && !itemF.enviadoPara.includes("falha-smtp@teste.local") && itemF.falhasDestinatarios.length === 1 && itemF.falhasDestinatarios[0].email === "falha-smtp@teste.local" && /554|recusada/i.test(itemF.falhasDestinatarios[0].motivo) && dsF.parciais >= 1 && dsF.destinatariosComFalha.some((e) => e.inspecaoId === rSol.id),
  `um e-mail por destinatário: os demais receberam e a falha de um foi informada (${itemF?.falhasDestinatarios?.[0]?.motivo})`);
const ordem = dsF.resultados.map((r) => r.inspecaoId);
const item2 = dsF.resultados.find((r) => r.inspecaoId === rSol2.id);
ok(dsF.resultados.length === dsF.total && ordem.indexOf(rSol.id) < ordem.indexOf(rSol2.id) && item2?.situacao === "enviado" && dsF.falhas === 0,
  `lote continua após a falha: a inspeção seguinte foi enviada (${dsF.enviados} enviado(s), ${dsF.parciais} parcial)`);
const depoisFalha = (await (await fetch(`${B}/api/entities/Inspecao/${rSol.id}`, { headers: { "x-dev-user": "admin@sol.local" } })).json()).DataDisparo;
ok(depoisFalha !== antesFalha, "inspeção recebida por parte dos destinatários fica marcada como enviada");
const logsFalha = await (await fetch(`${B}/api/entities/LogAuditoria`, { headers: { "x-dev-user": "admin@sol.local" } })).json();
ok(logsFalha.some((l) => l.Funcao === "admin.enviarEmailPA" && l.Status === false && l.Modelo.includes(rSol.id) && l.Descricao.includes("falha-smtp@teste.local")) && logsFalha.some((l) => l.Funcao === "admin.dispararSol" && l.Status === false && /não receberam/.test(l.Descricao)), "falha registrada no Log (por destinatário e no resumo do lote)");
const envParcial = await admin("admin.enviarPAInspecao", { id: rSol.id });
ok(envParcial.enviado && envParcial.falhasDestinatarios.map((f) => f.email).join() === "falha-smtp@teste.local", "envio individual informa quem não recebeu");
{ // nenhum destinatário recebe (modo teste só com o endereço recusado): falha, sem marcar como enviada
  await admin("admin.salvarConfigEmail", { ModoTeste: true, DestinatariosTeste: ["falha-smtp@teste.local"] });
  try { await admin("admin.enviarPAInspecao", { id: rSol2.id }); ok(false, "envio individual com falha deveria avisar"); } catch (e) { ok(/Falha ao enviar o e-mail/.test(e.message), `envio individual informa a falha: ${e.message}`); }
  const dsTodas = await admin("admin.dispararSol", { mes: new Date().getMonth() + 1, ano: new Date().getFullYear(), unidade: null });
  ok(dsTodas.falhas === dsTodas.total - dsTodas.semVinculo && dsTodas.enviados === 0 && dsTodas.erros.length === dsTodas.falhas, `lote em que ninguém recebe: ${dsTodas.falhas} falha(s), nenhuma marcada como enviada`);
  await admin("admin.salvarConfigEmail", { ModoTeste: false, DestinatariosTeste: [] });
}
await admin("admin.desvincularPessoa", { vinculoId: vFalha.id });
// ---- modo teste de e-mails (Admin › Programação) ----
const cfg0 = await admin("admin.obterConfigEmail");
ok(cfg0.ModoTeste === false && cfg0.DestinatariosTeste.length === 0, "modo teste desligado por padrão");
try { await admin("admin.salvarConfigEmail", { ModoTeste: true, DestinatariosTeste: [] }); ok(false, "modo teste sem destinatário deveria falhar"); } catch (e) { ok(/ao menos um destinatário/.test(e.message), `modo teste exige destinatário: ${e.message}`); }
try { await admin("admin.salvarConfigEmail", { ModoTeste: true, DestinatariosTeste: ["nao-e-email"] }); ok(false, "e-mail inválido deveria falhar"); } catch (e) { ok(/inválido/.test(e.message), `destinatário inválido bloqueado: ${e.message}`); }
try { await insp("admin.salvarConfigEmail", { ModoTeste: false, DestinatariosTeste: [] }); ok(false, "inspetor não configura"); } catch (e) { ok(e.status === 403, "só admin configura o modo teste"); }
const cfg1 = await admin("admin.salvarConfigEmail", { ModoTeste: true, DestinatariosTeste: ["Teste1@Exemplo.com", "teste2@exemplo.com; teste1@exemplo.com"] });
ok(cfg1.ModoTeste && JSON.stringify(cfg1.DestinatariosTeste) === '["teste1@exemplo.com","teste2@exemplo.com"]', `modo teste ligado: ${cfg1.DestinatariosTeste.join(", ")}`);
const dataAntesTeste = (await (await fetch(`${B}/api/entities/Inspecao/${rSol2.id}`, { headers: { "x-dev-user": "admin@sol.local" } })).json()).DataDisparo;
const envT = await admin("admin.enviarPAInspecao", { id: rSol2.id });
ok(envT.enviadoPara.length === 2 && envT.falhasDestinatarios.length === 0, "modo teste: um e-mail por destinatário de teste (como o SendEmail do Base44)");
ok(envT.enviado && envT.teste && JSON.stringify(envT.enviadoPara) === JSON.stringify(cfg1.DestinatariosTeste) && !envT.enviadoPara.includes(envT.destinatarios[0]), `modo teste: e-mail foi só para os destinatários de teste (${envT.enviadoPara.join(", ")})`);
const dataDepoisTeste = (await (await fetch(`${B}/api/entities/Inspecao/${rSol2.id}`, { headers: { "x-dev-user": "admin@sol.local" } })).json()).DataDisparo;
ok(dataDepoisTeste === dataAntesTeste, "modo teste não marca a inspeção como e-mail enviado");
const dsT = await admin("admin.dispararSol", { mes: new Date().getMonth() + 1, ano: new Date().getFullYear(), unidade: null });
ok(dsT.modoTeste && dsT.resultados.filter((r) => r.enviado).every((r) => r.teste && JSON.stringify(r.enviadoPara) === JSON.stringify(cfg1.DestinatariosTeste)), "disparo em lote no modo teste vai só para os destinatários de teste");
const cfg2 = await admin("admin.salvarConfigEmail", { ModoTeste: false, DestinatariosTeste: cfg1.DestinatariosTeste });
ok(!cfg2.ModoTeste && cfg2.DestinatariosTeste.length === 2, "modo teste desligado (destinatários ficam guardados)");
const envN = await admin("admin.enviarPAInspecao", { id: rSol2.id });
ok(envN.enviado && !envN.teste && JSON.stringify(envN.enviadoPara) === JSON.stringify(envN.destinatarios), "desligado: e-mail volta a ir para os responsáveis");
// ---- modelos de e-mail (individual / lote) ----
const cfgM0 = await admin("admin.obterConfigEmail");
ok(!cfgM0.modelos.individual.personalizado && !cfgM0.modelos.lote.personalizado && cfgM0.padrao.Corpo.includes("/plano-acao/{{id_inspecao}}") && !cfgM0.padrao.Corpo.includes("{{link}}") && cfgM0.padrao.Assunto.includes("{{unidade}}"), "modelos começam no padrão (assunto e HTML padrão disponíveis)");
ok(envN.assunto.startsWith("Resultado e Plano de Ação - Inspeção do Programa SOL - "), `assunto padrão mantido: ${envN.assunto}`);
try { await admin("admin.salvarModeloEmail", { tipo: "individual", Assunto: "x".repeat(301) }); ok(false, "assunto longo deveria falhar"); } catch (e) { ok(/300/.test(e.message), "assunto limitado a 300 caracteres"); }
try { await insp("admin.salvarModeloEmail", { tipo: "lote", Assunto: "x" }); ok(false, "inspetor não edita modelo"); } catch (e) { ok(e.status === 403, "só admin edita os modelos"); }
const salvoInd = await admin("admin.salvarModeloEmail", { tipo: "individual", Assunto: "Individual {{unidade}}\n- {{data}}", Corpo: '<h1>Olá {{area}}</h1><a href="https://app.teste/plano-acao/{{id_inspecao}}">abrir</a> {{link}} {{nao_existe}}', Importancia: "alta" }); // campo Importancia removido: é ignorado
ok(salvoInd.modelos.individual.personalizado && !salvoInd.modelos.lote.personalizado && JSON.stringify(salvoInd.avisos) === '["link","nao_existe"]', "modelo individual salvo (lote intacto); {{link}} removida e desconhecida avisada");
const salvoLote = await admin("admin.salvarModeloEmail", { tipo: "lote", Assunto: "Lote {{programa}} <b>{{unidade}}</b>", Corpo: "" });
ok(salvoLote.modelos.lote.personalizado && salvoLote.modelos.lote.Corpo === "", "modelo de lote salvo (corpo vazio = padrão)");
const envM = await admin("admin.enviarPAInspecao", { id: rSol2.id });
ok(envM.assunto === `Individual ${envM.unidade} - ${envM.data.split("-").reverse().join("/")}` && !("Importancia" in salvoInd.modelos.individual) && !("importancia" in envM), `envio individual usa o modelo individual (sem importância): "${envM.assunto}"`);
const dsM = await admin("admin.dispararSol", { mes: new Date().getMonth() + 1, ano: new Date().getFullYear(), unidade: null });
const loteEnv = dsM.resultados.filter((r) => r.enviado);
ok(loteEnv.length > 0 && loteEnv.every((r) => r.assunto === `Lote SOL <b>${r.unidade}</b>`), `disparo em lote usa o modelo de lote: "${loteEnv[0]?.assunto}"`);
const rest = await admin("admin.salvarModeloEmail", { tipo: "individual", restaurar: true });
await admin("admin.salvarModeloEmail", { tipo: "lote", restaurar: true });
const envR = await admin("admin.enviarPAInspecao", { id: rSol2.id });
ok(!rest.modelos.individual.personalizado && envR.assunto === envN.assunto, "restaurar padrão volta ao assunto/corpo originais");
const pl = await admin("admin.exportarPlanilha", { programa: "GRD" });
ok(pl.linhas.length >= 1 && pl.colunas.length === 11, `planilha GRD: ${JSON.stringify(pl.linhas[0])}`);
// planilha GRD dinâmica: renomear um pilar mantém as inspeções antigas na mesma coluna, com o nome novo
const pilares = (await (await fetch(`${B}/api/entities/Pilar`, { headers: { "x-dev-user": "admin@sol.local" } })).json());
const pil1 = pilares.find((x) => x.Nome === "1º Pilar");
const idx1 = pl.colunas.indexOf("1º Pilar");
await admin("admin.salvarCadastro", { entidade: "Pilar", id: pil1.id, dados: { Nome: "Pilar Renomeado E2E", Descricao: pil1.Descricao, Ordem: pil1.Ordem } });
const plR = await admin("admin.exportarPlanilha", { programa: "GRD" });
ok(plR.colunas.indexOf("Pilar Renomeado E2E") === idx1 && !plR.colunas.includes("1º Pilar") && plR.colunas.length === pl.colunas.length
  && JSON.stringify(plR.linhas.map((l) => l[idx1])) === JSON.stringify(pl.linhas.map((l) => l[idx1])), "planilha GRD: pilar renomeado mantém a coluna e os valores antigos");
await admin("admin.salvarCadastro", { entidade: "Pilar", id: pil1.id, dados: { Nome: pil1.Nome, Descricao: pil1.Descricao, Ordem: pil1.Ordem } });
{
  const { pilaresDaPlanilha } = await import(new URL("../src/lib/scores.js", import.meta.url).href);
  const cad = [{ id: "c", Nome: "3º Pilar", Ordem: 3 }, { id: "a", Nome: "1º Pilar", Ordem: 1 }, { id: "b", Nome: "Segurança (antigo 2º)", Ordem: 2 }];
  const it = (PilarId, PilarNome, Resposta) => ({ PilarId, PilarNome, Resposta });
  const antiga = { Checklist: [it("a", "1º Pilar", "Sim"), it("a", "1º Pilar", "Não"), it("b", "2º Pilar", "Sim"), it("d", "5º Pilar", "Não")] };
  const nova = { Checklist: [it("a", "1º Pilar", "Sim"), it("b", "Segurança (antigo 2º)", "Não"), it("c", "3º Pilar", "Sim")] };
  const r = pilaresDaPlanilha([antiga, nova], cad);
  ok(JSON.stringify(r.colunas) === JSON.stringify(["1º Pilar", "Segurança (antigo 2º)", "3º Pilar", "5º Pilar (excluído)"]), `planilha GRD: colunas dinâmicas ${JSON.stringify(r.colunas)}`);
  ok(JSON.stringify(r.valores(antiga)) === "[50,100,null,0]" && JSON.stringify(r.valores(nova)) === "[100,0,100,null]", "planilha GRD: renomeado/novo/excluído sem desalinhar valores");
}
await admin("admin.editarInspecao", { id: rSol.id, uapId, Data: hoje, RespAcompanhamento: "Editado", Cargo: "C", Observacao: "obs" });
await admin("admin.inativarInspecao", { id: rGrd.id, motivo: "teste" });
const obG = await pre("plano.obter", { inspecaoId: rGrd.id });
ok(obG.erro === "inativada", "PA de inspeção inativada bloqueado");
const inat = await admin("admin.listarInspecoes", { situacao: "inativadas" });
ok(inat.some((x) => x.InspecaoId === rGrd.id), "lista de inativadas");
const u = await admin("admin.salvarCadastro", { entidade: "Responsavel", dados: { Nome: "Novo Resp", Email: "Novo@X.com", Cargo: "Sup" } });
const dv = await admin("admin.dadosVinculos");
const v = await admin("admin.vincularPessoa", { uapId: dv.locais[5].UnidadeAreaProcessoId, papel: "Responsável", pessoaId: u.id });
await admin("admin.salvarCadastro", { entidade: "Responsavel", id: u.id, dados: { Nome: "Novo Resp 2", Email: "novo@x.com", Cargo: "Sup" } });
const vv = await (await fetch(`${B}/api/entities/Vinculo/${v.id}`, { headers: { "x-dev-user": "admin@sol.local" } })).json();
ok(vv.Nome === "Novo Resp 2", "vínculo sincronizado após editar pessoa");
try { await admin("admin.removerCadastro", { entidade: "Unidade", id: dv.unidades[0].id }); ok(false, "unidade em uso"); } catch (e) { ok(true, `remover unidade em uso bloqueado: ${e.message}`); }
const pend = await admin("admin.areasSemResponsaveis", { programa: "GRD" });
ok(pend.length > 0, `áreas sem líder/gestor: ${pend.length}`);
const ag = await admin("admin.listarAgendamentos");
ok(ag.tipos.length === 5, "agendamentos");
const logs = await (await fetch(`${B}/api/entities/LogAuditoria?sort=-Data&limit=5`, { headers: { "x-dev-user": "admin@sol.local" } })).json();
ok(logs.length === 5, `logs: ${logs.map((l) => l.Acao).join(" | ")}`);

console.log(falhas ? `\n${falhas} FALHA(S)` : "\nTODOS OS TESTES PASSARAM");
process.exit(falhas ? 1 : 0);
