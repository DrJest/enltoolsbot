const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const sqlite3 = require('sqlite3').verbose();
const cheerio = require('cheerio');
const dotenv = require('dotenv');

dotenv.config();

const token = process.env.TELEGRAM_TOKEN;

const bot = new TelegramBot(token, { polling: true });

const db = new sqlite3.Database('db.sqlite3', (err) => {
  if (err) {
    console.error(err.message);
  }
  console.log('Connected to the database.');
});

db.serialize(() => {
  db.run('CREATE TABLE IF NOT EXISTS tracking (id INTEGER PRIMARY KEY AUTOINCREMENT, chat_id TEXT, url TEXT, selector TEXT, last_value TEXT)');
});

const checkPage = async (url, selector) => {
  const response = await axios.get(url);
  const html = response.data;
  if (!selector) {
    return html;
  }
  const $ = cheerio.load(html);
  const value = $(selector).text().trim();
  return value;
};

const checkPages = async () => {
  db.all('SELECT * FROM tracking', async (err, rows) => {
    if (err) {
      return console.error(err.message);
    }
    for (const row of rows) {
      const { id, chat_id, url, selector, last_value } = row;
      const value = await checkPage(url, selector);
      if (!last_value) {
        db.run('UPDATE tracking SET last_value = ? WHERE id = ?', [value, id], function (err) {
          if (err) {
            return console.error(err.message);
          }
        });
        return;
      }
      if (value !== last_value) {
        db.run('UPDATE tracking SET last_value = ? WHERE id = ?', [value, id], function (err) {
          if (err) {
            return console.error(err.message);
          }
          const response = `ID: ${row.id} Value changed: ${value}`;
          bot.sendMessage(chat_id, response);
        });
      }
    }
  });
};

(async () => {
  bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    const response = 'Welcome to the page tracker bot!';

    bot.sendMessage(chatId, response);
  });

  bot.onText(/\/track (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;

    const [url, selector] = match[1].split(' ', 2);

    db.run('INSERT INTO tracking (chat_id, url, selector) VALUES (?, ?, ?)', [chatId, url, selector], function (err) {
      if (err) {
        return console.error(err.message);
      }
      const response = `Tracking started. ID: ${this.lastID}`;
      bot.sendMessage(chatId, response);
    });

  });

  bot.onText(/\/untrack (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;

    const id = match[1];

    db.run('DELETE FROM tracking WHERE id = ? AND chat_id = ?', [id, chatId], function (err) {
      if (err) {
        return console.error(err.message);
      }
      const response = `Tracking stopped. ID: ${id}`;
      bot.sendMessage(chatId, response);
    });

  });

  bot.onText(/\/list/, async (msg) => {
    const chatId = msg.chat.id;

    db.all('SELECT * FROM tracking WHERE chat_id = ?', [chatId], (err, rows) => {
      if (err) {
        return console.error(err.message);
      }
      const response = rows.map(row => `ID: ${row.id} URL: ${row.url} Selector: ${row.selector}`).join('\n');
      bot.sendMessage(chatId, response);
    });
  });
})(bot, db);

setInterval(checkPages, 10000);

checkPages();