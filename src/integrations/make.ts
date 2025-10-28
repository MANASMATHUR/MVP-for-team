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

// Simple email sending via EmailJS (free tier)
export async function sendLowStockEmail(subject: string, body: string, recipient: string): Promise<boolean> {
  const emailjsServiceId = import.meta.env.VITE_EMAILJS_SERVICE_ID;
  const emailjsTemplateId = import.meta.env.VITE_EMAILJS_TEMPLATE_ID;
  const emailjsUserId = import.meta.env.VITE_EMAILJS_USER_ID;
  
  console.log('=== EmailJS Configuration Check ===');
  console.log('Service ID:', emailjsServiceId ? '✓' : '✗');
  console.log('Template ID:', emailjsTemplateId ? '✓' : '✗');
  console.log('User ID:', emailjsUserId ? '✓' : '✗');
  
  if (!emailjsServiceId || !emailjsTemplateId || !emailjsUserId) {
    console.warn('EmailJS not fully configured - email sending disabled');
    return false;
  }
  
  try {
    // Load EmailJS dynamically
    const emailjs = await import('@emailjs/browser');
    
    console.log('EmailJS loaded, sending email...');
    
    // Template variables must match EXACTLY what's in your EmailJS template
    // Common variable names: email/to_email, subject, message
    // We include multiple keys to maximize compatibility with typical templates
    const templateParams = {
      email: recipient,
      to_email: recipient,
      subject,
      message: body,
      body,
    } as Record<string, string>;
    
    console.log('Sending with params:', { ...templateParams, message: '(truncated)' });
    
    const result = await emailjs.send(
      emailjsServiceId,
      emailjsTemplateId,
      templateParams,
      emailjsUserId
    );
    
    console.log('✓ Email sent successfully:', result);
    return true;
  } catch (error: any) {
    console.error('✗ Failed to send email:', error);
    console.error('Error details:', {
      serviceId: emailjsServiceId,
      templateId: emailjsTemplateId,
      userId: emailjsUserId?.substring(0, 10) + '...',
      errorMessage: error?.message,
      errorText: error?.text
    });
    return false;
  }
}


