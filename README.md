# 🤖 Discord Bot Setup

A simple guide to configure and run your Discord bot using **Python** or **Java**.

---

## ⚙️ 1. Configure `.env`

First, locate the:

```text
.env.example
```

file and rename it to:

```text
.env
```

Then open `.env` and replace the placeholders:

```env
YOUR_TARGET_USER_ID_HERE=YOUR_DISCORD_USER_ID
YOUR_BOT_TOKEN_HERE=YOUR_BOT_TOKEN
```

### 🔑 Getting your Discord Bot Token

1. Go to [Discord Developer Portal](https://discord.com/developers/applications?utm_source=chatgpt.com)
2. Log in to your Discord account.
3. Click **New Application**.
4. Create your application.
5. Open **Bot** from the sidebar.
6. Click **Reset Token**.
7. Enter your password if Discord asks for it.
8. Copy the token and place it in `.env`.

> ⚠️ **IMPORTANT:** Never share your bot token or upload your `.env` file to GitHub. If the token is exposed, reset it immediately.

---

# 🐍 2. Python Setup

### Check Python

Open **CMD** and run:

```cmd
python --version
```

or:

```cmd
py --version
```

If Python is installed correctly, you should see something similar to:

```text
Python 3.x.x
```

### Create a virtual environment

```cmd
python -m venv venv
```

Activate it:

```cmd
venv\Scripts\activate
```

### Install dependencies

If the project contains `requirements.txt`:

```cmd
pip install -r requirements.txt
```

If you need `discord.py`:

```cmd
pip install discord.py
```

### Run the bot

```cmd
python bot.py
```

Or, if the main file has another name:

```cmd
python main.py
```

---

# ☕ 3. Java Setup

### Check Java

Open **CMD**:

```cmd
java -version
```

Check the Java compiler:

```cmd
javac -version
```

You should have a supported **JDK** installed, not just the Java runtime.

### Compile the project

For a simple Java project:

```cmd
javac -d out src\*.java
```

Then run it:

```cmd
java -cp out Main
```

Replace `Main` with the name of your main class.

### Maven projects

If the project contains:

```text
pom.xml
```

check Maven:

```cmd
mvn -version
```

Build the project:

```cmd
mvn clean package
```

Run the generated JAR:

```cmd
java -jar target\your-bot.jar
```

### Gradle projects

If the project contains:

```text
build.gradle
```

build it with:

```cmd
gradlew build
```

Then run the generated JAR:

```cmd
java -jar build\libs\your-bot.jar
```

---


---

# 🔒 5. Protect Your Token

Add `.env` to `.gitignore`:

```gitignore
.env
venv/
__pycache__/
*.class
target/
```

Never put your real token directly inside your source code.

❌ Don't do:

```python
TOKEN = "YOUR_REAL_BOT_TOKEN"
```

❌ And don't commit:

```text
.env
```

to GitHub.

---

# 🚀 6. Quick Start

### Python

```
START FILE "start.bat"
```

### Java 

```
START fILE "start - js.bat"
```


---

## ✅ You're Ready!

Once the `.env` file is configured and the dependencies are installed, start your bot using the appropriate command above.

**Python:**

```cmd
python bot.py
```

**Java:**

```cmd
java -jar target\your-bot.jar
```

Your bot should now connect to Discord and appear **Online**.
