import sqlite3

conn = sqlite3.connect(r'C:\Users\freem\AppData\Roaming\DashBot\dashbot.db')
c = conn.cursor()

c.execute("SELECT id, name FROM teams")
print("Teams:", c.fetchall())

conn.close()
