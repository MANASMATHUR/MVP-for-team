export async function notifyLowStock(payload: {
  id: string;
  player_name: string;
  edition: string;
  size: string;
  qty_inventory: number;
  reorder_email_draft?: string; // optional: include a ready-to-send email draft
}) {
  const webhookUrl = import.meta.env.VITE_MAKE_WEBHOOK_URL as string | undefined;
  if (!webhookUrl) return;
  try {
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch (e) {
    // swallow errors for MVP
    console.error('Make.com webhook failed', e);
  }
}


