#!/usr/bin/env bash
# ==============================================================================
# WhatsApp Multi-Cloud Bot - GitHub Push Script
# Roman Urdu instructions ke sath automated GitHub CLI helper
# ==============================================================================

set -e

echo "======================================================"
echo "  🚀 WhatsApp Bot Suite - GitHub Push Assistant"
echo "======================================================"
echo ""

# 1. Check if git is installed
if ! command -v git &> /dev/null; then
    echo "❌ Error: Git aap ke system par install nahi hai!"
    echo "Baraye meharbani pehle Git install karein: https://git-scm.com/"
    exit 1
fi

# 2. Check if git repository is initialized
if [ ! -d ".git" ]; then
    echo "⚙️ Git repository initialize kar rahey hain..."
    git init -b main
    git config user.name "Zahid Ashiq"
    git config user.email "zahidashiqusa@gmail.com"
fi

# 3. Ensure files are committed
echo "📦 Files ki checking aur initial commit status..."
git add .
if git diff --staged --quiet; then
    echo "✅ Sabhi files pehle se committed hain (Working tree clean hai)."
else
    git commit -m "Initial commit: Multi-cloud WhatsApp Bot suite (Vercel, Railway, Render, Heroku)"
    echo "✅ Files successfully commit ho chuki hain."
fi

echo ""
echo "------------------------------------------------------"
echo "  GitHub Par Push Karne Ka Tareeqa Choose Karein:"
echo "  1) GitHub CLI (gh command) - Recommended"
echo "  2) HTTPS Repository URL (Manual Git Remote)"
echo "  3) SSH Repository URL (git@github.com:...)"
echo "------------------------------------------------------"
read -p "Apna intekhab darj karein [1, 2, ya 3] (Default: 1): " CHOICE
CHOICE=${CHOICE:-1}

if [ "$CHOICE" = "1" ]; then
    if ! command -v gh &> /dev/null; then
        echo ""
        echo "⚠️ Warning: 'gh' (GitHub CLI) install nahi mila."
        echo "Aap ya toh 'gh' install kar sakte hain (https://cli.github.com/) ya Option 2 istemal karein."
        read -p "Kya aap HTTPS URL ke zariye push karna chahte hain? (y/n): " FALLBACK
        if [ "$FALLBACK" != "y" ] && [ "$FALLBACK" != "Y" ]; then
            echo "Cancelled. Pehle GitHub CLI install karein aur dobara chalayein."
            exit 1
        fi
        CHOICE="2"
    else
        echo ""
        echo "🔍 Checking GitHub CLI authentication..."
        if ! gh auth status &> /dev/null; then
            echo "⚠️ Aap GitHub CLI par login nahi hain."
            echo "🔑 Baraye meharbani GitHub par login karein:"
            gh auth login
        else
            echo "✅ GitHub CLI logged in hai."
        fi

        echo ""
        read -p "Naye GitHub Repository ka naam darj karein (e.g. whatsapp-bot-suite): " REPO_NAME
        if [ -z "$REPO_NAME" ]; then
            REPO_NAME="whatsapp-multicloud-bot"
        fi

        echo "Visibility:"
        echo "  1) Public (Sab dekh sakein ge)"
        echo "  2) Private (Sirf aap dekh sakein ge)"
        read -p "Intekhab karein [1 ya 2] (Default: 1): " VIS_CHOICE
        VISIBILITY="--public"
        if [ "$VIS_CHOICE" = "2" ]; then
            VISIBILITY="--private"
        fi

        echo ""
        echo "🚀 GitHub par '$REPO_NAME' create aur push kiya ja raha hai..."

        # Check if origin remote exists
        if git remote | grep -q "origin"; then
            echo "ℹ️ Origin remote pehle se mojood hai. Remote par push kar rahe hain..."
            git branch -M main
            git push -u origin main
        else
            gh repo create "$REPO_NAME" $VISIBILITY --source=. --remote=origin --push
        fi

        echo ""
        echo "🎉 Mubarak ho! Aapka project kamyabi se GitHub par push ho chuka hai!"
        gh repo view --web || true
        exit 0
    fi
fi

if [ "$CHOICE" = "2" ] || [ "$CHOICE" = "3" ]; then
    echo ""
    echo "Pehle GitHub (https://github.com/new) par ja kar aik empty repository banayein."
    echo "Note: 'Initialize this repository with README' ko UNCHECK rehne dein."
    echo ""
    read -p "Apna GitHub Repo URL paste karein (e.g. https://github.com/user/repo.git): " REPO_URL
    
    if [ -z "$REPO_URL" ]; then
        echo "❌ Error: Repo URL lazmi hai."
        exit 1
    fi

    if git remote | grep -q "origin"; then
        git remote set-url origin "$REPO_URL"
    else
        git remote add origin "$REPO_URL"
    fi

    git branch -M main
    echo "🚀 GitHub par push kiya ja raha hai..."
    git push -u origin main

    echo ""
    echo "🎉 Mubarak ho! Files kamyabi se GitHub par push ho chuki hain!"
    exit 0
fi
