(() => {
  let outlook = { configured: false, connected: false, email: "" };
  const composer = document.querySelector("#studio .composer");
  const subject = document.getElementById("subject");
  const message = document.getElementById("message");
  const approve = document.getElementById("approveDraft");
  if (!composer || !subject || !message || !approve) return;

  const recipientLabel = document.createElement("label");
  recipientLabel.innerHTML = 'Recipient email<input id="recipientEmail" type="email" autocomplete="off" placeholder="name@company.com">';
  subject.closest("label").after(recipientLabel);

  const connection = document.createElement("div");
  connection.className = "email-connection";
  connection.innerHTML = '<div><span id="emailDot"></span><strong id="emailStatus">Checking Outlook connection…</strong><small id="emailAccount">Emails send only after your final confirmation.</small></div><button class="secondary" id="connectOutlook">Connect Outlook</button>';
  message.closest("label").after(connection);
  approve.textContent = "Review & send →";

  const dialog = document.createElement("dialog");
  dialog.className = "send-dialog";
  dialog.innerHTML = '<form method="dialog"><button class="dialog-close" aria-label="Close">×</button></form><span class="draft-badge">Final sending approval</span><h2>Send this email?</h2><div class="send-summary"><span>From</span><strong id="confirmFrom"></strong><span>To</span><strong id="confirmTo"></strong><span>Subject</span><strong id="confirmSubject"></strong></div><p>This sends immediately through Microsoft Outlook and saves a copy in Sent Items.</p><div class="action-row"><button class="secondary" id="cancelSend">Cancel</button><button class="approve" id="confirmSend">Send email</button></div>';
  document.body.append(dialog);

  const notify = (text) => typeof toast === "function" ? toast(text) : alert(text);
  const render = () => {
    document.getElementById("emailDot").classList.toggle("connected", outlook.connected);
    document.getElementById("emailStatus").textContent = outlook.connected ? "Outlook connected" : outlook.configured ? "Outlook not connected" : "Outlook setup required";
    document.getElementById("emailAccount").textContent = outlook.connected ? outlook.email : "Emails send only after your final confirmation.";
    document.getElementById("connectOutlook").textContent = outlook.connected ? "Disconnect" : "Connect Outlook";
  };
  const check = async () => {
    try { outlook = await (await fetch("/api/outlook?action=status")).json(); }
    catch { outlook = { configured: false, connected: false, email: "" }; }
    render();
  };

  document.getElementById("connectOutlook").addEventListener("click", async () => {
    if (!outlook.connected) { location.href = "/api/outlook?action=login"; return; }
    if (!confirm(`Disconnect ${outlook.email}?`)) return;
    await fetch("/api/outlook?action=logout", { method: "POST" });
    outlook = { ...outlook, connected: false, email: "" }; render(); notify("Outlook disconnected");
  });

  approve.addEventListener("click", (event) => {
    event.stopImmediatePropagation();
    if (!outlook.configured) { notify("Outlook sending still needs Microsoft configuration"); return; }
    if (!outlook.connected) { location.href = "/api/outlook?action=login"; return; }
    const to = document.getElementById("recipientEmail").value.trim();
    if (!/^\S+@\S+\.\S+$/.test(to)) { notify("Enter a valid recipient email"); return; }
    document.getElementById("confirmFrom").textContent = outlook.email;
    document.getElementById("confirmTo").textContent = to;
    document.getElementById("confirmSubject").textContent = subject.value;
    dialog.showModal();
  }, { capture: true });

  document.getElementById("cancelSend").addEventListener("click", () => dialog.close());
  document.getElementById("confirmSend").addEventListener("click", async () => {
    const button = document.getElementById("confirmSend"); button.disabled = true; button.textContent = "Sending…";
    try {
      const response = await fetch("/api/outlook?action=send", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ to: document.getElementById("recipientEmail").value.trim(), subject: subject.value, message: message.value }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error || "Email could not be sent.");
      dialog.close(); notify(`Email sent to ${data.to}`);
    } catch (error) { notify(error.message); }
    finally { button.disabled = false; button.textContent = "Send email"; }
  });

  const params = new URLSearchParams(location.search);
  if (location.hash === "#studio" || params.has("email_connected") || params.has("email_error")) { if (typeof showPage === "function") showPage("studio"); }
  if (params.has("email_connected")) notify("Outlook connected");
  if (params.has("email_error")) notify(params.get("email_error") === "wrong_account" ? "Connect luke.rossi82@buc.blinn.edu" : "Outlook connection failed");
  if (params.has("email_connected") || params.has("email_error")) history.replaceState({}, "", location.pathname + "#studio");
  render(); check();
})();
