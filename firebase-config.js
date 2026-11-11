// 1. Створіть Firebase-проєкт і додайте Web App.
// 2. Скопіюйте конфігурацію з Firebase Console → Project settings → Your apps.
// 3. Вставте значення замість PLACEHOLDER.
// Не додавайте сюди паролі. Захист забезпечують Authentication та Database Rules.
export const firebaseConfig = {
  apiKey: "PASTE_API_KEY",
  authDomain: "PASTE_PROJECT_ID.firebaseapp.com",
  databaseURL: "https://PASTE_DATABASE_NAME.REGION.firebasedatabase.app",
  projectId: "PASTE_PROJECT_ID",
  storageBucket: "PASTE_PROJECT_ID.appspot.com",
  messagingSenderId: "PASTE_MESSAGING_SENDER_ID",
  appId: "PASTE_APP_ID"
};

export const isFirebaseConfigured = !Object.values(firebaseConfig).some(v => String(v).includes("PASTE_"));
