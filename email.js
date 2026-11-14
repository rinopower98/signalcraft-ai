(() => {
  let gmail = { configured: false, connected: false, email: "" };
  const composer = document.querySelector("#studio .composer");
  const subject = document.getElementById("subject");
  const message = document.getElementById("message");
  const approve = document.getElementById("approveDraft");
  if (!composer || !subject || !message || !approve) return;

  const recipientLabel = document.createElement("label");
  recipientLabel.innerHTML = '<span>Recipient email</span><input id="recipientEmail" type="email" autocomplete="off" placeholder="name@company.com">';
  subject.closest("label").after(recipientLabel);

  const connection = document.createElement("div");
  connection.className = "email-connection";
  connection.innerHTML = '<div><span id="emailDot"></span><strong id="emailStatus">Checking Gmail sender…</strong><small id="emailAccount">Emails send only after your final confirmation.</small></div><button class="secondary" id="gmailStatus" disabled>Checking…</button>';
  message.closest("label").after(connection);
  approve.textContent = "Review & send →";

  const dialog = document.createElement("dialog");
  dialog.className = "send-dialog";
  dialog.innerHTML = '<form method="dialog"><button class="dialog-close" aria-label="Close">×</button></form><span class="draft-badge">Final sending approval</span><h2>Send this email?</h2><div class="send-summary"><span>From</span><strong id="confirmFrom"></strong><span>To</span><strong id="confirmTo"></strong><span>Subject</span><strong id="confirmSubject"></strong></div><p>This sends immediately through SignalCraft Gmail.</p><div class="action-row"><button class="secondary" id="cancelSend">Cancel</button><button class="approve" id="confirmSend">Send email</button></div>';
  document.body.append(dialog);

  const notify = (text) => typeof toast === "function" ? toast(text) : alert(text);
  const render = () => {
    document.getElementById("emailDot").classList.toggle("connected", gmail.connected);
    document.getElementById("emailStatus").textContent = gmail.connected ? "Gmail ready" : "Gmail setup required";
    document.getElementById("emailAccount").textContent = gmail.connected ? gmail.email : "Add the Gmail app password to enable sending.";
    document.getElementById("gmailStatus").textContent = gmail.connected ? "Ready" : "Setup required";
  };
  const check = async () => {
    try { gmail = await (await fetch("/api/gmail?action=status")).json(); }
    catch { gmail = { configured: false, connected: false, email: "" }; }
    render();
  };

  approve.addEventListener("click", (event) => {
    event.stopImmediatePropagation();
    if (!gmail.configured) { notify("Gmail sending still needs its app password"); return; }
    const to = document.getElementById("recipientEmail").value.trim();
    if (!/^\S+@\S+\.\S+$/.test(to)) { notify("Enter a valid recipient email"); return; }
    document.getElementById("confirmFrom").textContent = gmail.email;
    document.getElementById("confirmTo").textContent = to;
    document.getElementById("confirmSubject").textContent = subject.value;
    dialog.showModal();
  }, { capture: true });

  document.getElementById("cancelSend").addEventListener("click", () => dialog.close());
  document.getElementById("confirmSend").addEventListener("click", async () => {
    const button = document.getElementById("confirmSend");
    button.disabled = true;
    button.textContent = "Sending…";
    try {
      const response = await fetch("/api/gmail?action=send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: document.getElementById("recipientEmail").value.trim(),
          subject: subject.value,
          message: message.value,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Email could not be sent.");
      dialog.close();
      notify("Email sent to " + data.to);
    } catch (error) {
      notify(error.message);
    } finally {
      button.disabled = false;
      button.textContent = "Send email";
    }
  });

  if (location.hash === "#studio" && typeof showPage === "function") showPage("studio");
  render();
  check();
})();
