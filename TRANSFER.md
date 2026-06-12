# TRANSFER BRANCH — this is the 7MW app, not breathhold-trainer code

This branch of breathhold-trainer is a temporary transfer vehicle: the 7MW
app was built in a Claude Code session that could not reach the new
github.com/liseman/7mw repository (session repo scope is fixed at start).

To migrate (from any machine or a Claude session with access to both repos):

    git clone --branch claude/vibrant-babbage-ivgvqi git@github.com:liseman/breathhold-trainer.git 7mw
    cd 7mw
    git remote set-url origin git@github.com:liseman/7mw.git
    git push -u origin HEAD:main

Then delete this branch from breathhold-trainer and this TRANSFER.md file.
Never merge this branch into breathhold-trainer main.

After migrating, in the 7mw repo settings add Actions secrets
ELEVENLABS_API_KEY and EXPO_TOKEN, then run the "Regenerate voice cues"
and "Build iOS and submit to TestFlight" workflows.
