// Fonction Serverless Vercel — relaie les demandes de consultation vers le CRM (Zapier).
//
// Configurez l'URL du webhook dans Vercel (et NON dans le code) :
//   Project → Settings → Environment Variables →
//     ZAPIER_WEBHOOK_URL = https://hooks.zapier.com/hooks/catch/18421979/43et2xu/
//
// Le formulaire poste sur /api/lead (même origine). Deux modes :
//   - via fetch (en-tête X-Requested-With: fetch) → réponse JSON {ok:true}
//   - via envoi natif du formulaire (sans JS) → redirection 303 vers la page avec ?envoi=ok

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const url = process.env.ZAPIER_WEBHOOK_URL;
  const isAjax = (req.headers["x-requested-with"] === "fetch");

  function fail(status, message) {
    if (isAjax) return res.status(status).json({ ok: false, error: message });
    res.writeHead(303, { Location: "/?envoi=erreur#consultation" });
    return res.end();
  }

  function ok() {
    if (isAjax) return res.status(200).json({ ok: true });
    res.writeHead(303, { Location: "/?envoi=ok#consultation" });
    return res.end();
  }

  if (!url) {
    return fail(500, "Webhook non configuré (ZAPIER_WEBHOOK_URL manquant)");
  }

  try {
    let body = req.body || {};
    if (typeof body === "string") {
      try { body = Object.fromEntries(new URLSearchParams(body)); } catch (e) { body = {}; }
    }

    // Honeypot : si le champ piège "company" est rempli, c'est un bot.
    // On simule un succès sans rien envoyer au CRM.
    if (body.company) {
      return ok();
    }

    const data = {
      nom: body.nom || body.name || "",
      telephone: body.telephone || body.phone || "",
      email: body.email || "",
      studio: body.studio || "",
      source: body.source || "Landing Page Lèvres",
      page: body.page || "",
      date: body.date || new Date().toISOString()
    };

    // Validation serveur (filet de sécurité, même sans JS)
    if (!data.nom || !data.telephone || !data.email || !data.studio) {
      return fail(400, "Champs obligatoires manquants");
    }

    const params = new URLSearchParams();
    Object.keys(data).forEach(function (k) { if (data[k] !== "") params.append(k, String(data[k])); });

    const upstream = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString()
    });

    if (!upstream.ok) {
      return fail(502, "Le CRM a renvoyé le statut " + upstream.status);
    }

    return ok();
  } catch (e) {
    return fail(500, "Erreur lors de l'envoi");
  }
};
