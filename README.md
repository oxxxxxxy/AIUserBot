# AI UserBot

Windows-приложение для автоматических ответов клиентам в личных сообщениях Telegram. Ответы создаются по настраиваемому контексту компании через локальный OmniRoute.

## MVP

- авторизация Telegram user account через GramJS;
- автоответы только в личных диалогах и только на входящий текст;
- задержка для объединения сообщений клиента;
- пауза диалога после ручного ответа владельца;
- редактор контекста компании и проверка DeepSeek;
- установочный и portable `.exe` через GitHub Actions.

## Запуск

Нужны Node.js 22 и OmniRoute на `http://127.0.0.1:20128`.

```bash
npm install
npm start
```

Создай Telegram API-приложение на [my.telegram.org](https://my.telegram.org), затем введи API ID, API Hash и телефон во вкладке «Telegram». Код входа и пароль 2FA вводятся в окне приложения.

## Windows EXE

После push открой GitHub → Actions → `Build Windows EXE` → последний запуск → Artifacts → `AIUserBot-Windows`.

Telegram API Hash, сессия и пароль 2FA не включаются в Git и сохраняются в профиле Electron текущего пользователя.
