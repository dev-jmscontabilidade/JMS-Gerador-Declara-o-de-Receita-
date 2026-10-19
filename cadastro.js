/*
 * Proxy mínimo para o Cadastro Mestre: guarda o token no servidor.
 *   GET /api/cadastro?busca=<trecho>  -> lista (autocomplete)
 *   GET /api/cadastro?cnpj=<cnpj>     -> dados do cliente
 * Variável na Vercel: CADASTRO_MESTRE_TOKEN (o código da plataforma é lido do próprio token).
 * Opcional: CADASTRO_MESTRE_PLATAFORMA, caso queira informar à mão.
 */
const BASE = (process.env.CADASTRO_MESTRE_URL || 'https://cadastro-mestre.vercel.app') + '/api/v1';

const REGIME = { SIMPLES:'Simples Nacional', PRESUMIDO:'Lucro Presumido', REAL:'Lucro Real', IMUNE:'Imune ou isenta', ISENTA:'Imune ou isenta' };

const cnaeFmt = c => { const d = String(c||'').replace(/\D/g,''); return d.length===7 ? `${d.slice(0,4)}-${d[4]}/${d.slice(5)}` : (c||''); };

// Token = cm_<plataforma em minúsculas>_<43 caracteres>  ->  X-Plataforma = plataforma em maiúsculas
function plataforma() {
  if (process.env.CADASTRO_MESTRE_PLATAFORMA) return process.env.CADASTRO_MESTRE_PLATAFORMA;
  const m = /^cm_(.+)_[A-Za-z0-9_-]{43}$/.exec(process.env.CADASTRO_MESTRE_TOKEN || '');
  return m ? m[1].toUpperCase() : '';
}

async function cm(path) {
  const r = await fetch(BASE + path, { headers: {
    Authorization: 'Bearer ' + process.env.CADASTRO_MESTRE_TOKEN,
    'X-Plataforma': plataforma(),
  }});
  return { status: r.status, corpo: await r.json().catch(() => ({})) };
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const { busca, cnpj } = req.query;
    if (cnpj) {
      const id = String(cnpj).replace(/[.\/\-\s]/g, '').toUpperCase();
      const { status, corpo } = await cm('/empresas/' + encodeURIComponent(id));
      if (status !== 200) return res.status(status).json({ erro: corpo.erro || 'erro no Cadastro Mestre' });
      const reg = corpo.regimeTributario?.vigente?.regime;
      return res.json({
        razaoSocial: corpo.razaoSocial || '', cnpjFormatado: corpo.cnpjFormatado || '',
        cnae: cnaeFmt(corpo.cnaePrincipal), regime: REGIME[reg] || '',
        situacaoCadastral: corpo.situacaoCadastral || null,
      });
    }
    let q = String(busca || '').trim();
    if (!q) return res.json({ resultados: [], total: 0 });
    if (/^[\d.\/\-\s]+$/.test(q)) q = q.replace(/\D/g, ''); // CNPJ com máscara
    const { status, corpo } = await cm('/empresas?busca=' + encodeURIComponent(q));
    if (status !== 200) return res.status(status).json({ erro: corpo.erro || 'erro no Cadastro Mestre' });
    res.json({ resultados: (corpo.resultados || []).map(e => ({ cnpj: e.cnpj, cnpjFormatado: e.cnpjFormatado, razaoSocial: e.razaoSocial })), total: corpo.total || 0 });
  } catch (e) {
    res.status(502).json({ erro: 'Cadastro Mestre indisponível' });
  }
};