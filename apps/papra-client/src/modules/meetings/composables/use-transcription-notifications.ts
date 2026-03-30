import type { Meeting } from '../meetings.types';

const pendingIds = new Set<string>();

export function requestNotificationPermission() {
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }
}

export function trackMeetingsForNotifications(meetings: Meeting[]) {
  for (const meeting of meetings) {
    if (pendingIds.has(meeting.id) && meeting.status === 'completed') {
      notifyTranscriptionComplete(meeting);
    }
  }

  pendingIds.clear();

  for (const meeting of meetings) {
    if (meeting.status === 'processing' || meeting.status === 'uploading') {
      pendingIds.add(meeting.id);
    }
  }
}

function notifyTranscriptionComplete(meeting: Meeting) {
  if (!('Notification' in window) || Notification.permission !== 'granted') {
    return;
  }

  new Notification('Transcription complete', {
    body: meeting.title,
    icon: '/favicon.ico',
    tag: `meeting-${meeting.id}`,
  });
}
