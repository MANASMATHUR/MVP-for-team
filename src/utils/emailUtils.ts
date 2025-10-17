export async function copyEmailToClipboard(subject: string, body: string, recipient: string): Promise<boolean> {
  try {
    const emailContent = `To: ${recipient}\nSubject: ${subject}\n\n${body}`;
    await navigator.clipboard.writeText(emailContent);
    return true;
  } catch (error) {
    console.error('Failed to copy to clipboard:', error);
    return false;
  }
}

export function openEmailClient(recipient: string, subject: string, body: string): void {
  const mailto = `mailto:${encodeURIComponent(recipient)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  window.location.href = mailto;
}
