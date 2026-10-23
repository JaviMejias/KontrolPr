import type { PullRequestSnapshot } from "../../types/domain";

let audioContext: AudioContext | undefined;

export async function enableSound(): Promise<void> {
  audioContext ??= new AudioContext();
  await audioContext.resume();
}

export function playNotificationSound(): boolean {
  if (!audioContext || audioContext.state !== "running") return false;
  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();
  oscillator.connect(gain);
  gain.connect(audioContext.destination);
  const time = audioContext.currentTime;
  oscillator.frequency.setValueAtTime(660, time);
  oscillator.frequency.setValueAtTime(880, time + 0.12);
  gain.gain.setValueAtTime(0, time);
  gain.gain.linearRampToValueAtTime(0.12, time + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.001, time + 0.35);
  oscillator.start(time);
  oscillator.stop(time + 0.36);
  return true;
}

export async function showSystemNotification(count: number): Promise<void> {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  const options = { body: `${count} PR con novedades. Abre KontrolPR para revisarlos.`, tag: "kontrolpr-updates", icon: "/favicon.svg" };
  const registration = "serviceWorker" in navigator ? await navigator.serviceWorker.getRegistration() : undefined;
  if (registration) await registration.showNotification("Novedades en tus PR", options);
  else {
    const notification = new Notification("Novedades en tus PR", options);
    notification.onclick = () => { window.focus(); notification.close(); };
  }
}

export function notificationEventIds(pullRequest: PullRequestSnapshot): string[] {
  return [
    `${pullRequest.key}:created`,
    ...pullRequest.comments.map((comment) => `${pullRequest.key}:comment:${comment.id}:${comment.updatedAt ?? comment.createdAt}`),
    ...pullRequest.commits.map((commit) => `${pullRequest.key}:commit:${commit.hash}`),
  ];
}
