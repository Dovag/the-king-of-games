const CATEGORY = 'music';
let itemData = [];
const personId = getPersonId();

function getPersonId() {
    let id = localStorage.getItem('person_id');
    if (!id) { id = 'p_' + crypto.randomUUID(); localStorage.setItem('person_id', id); }
    return id;
}

window.onload = async function () { await loadItems(); await displayYearlyArchives(); };

async function loadItems() {
    try { const res = await fetch('/api/items/' + CATEGORY); const data = await res.json(); itemData = data.items || []; } catch (e) { itemData = []; }
    var table = document.getElementById('itemTable');
    while (table.rows.length > 1) table.deleteRow(1);
    itemData.forEach((entry, index) => { addRow(entry.cover, entry.name, entry.creator, entry.like_count, entry.neutral_count, entry.dislike_count, entry.created_at, index, entry.id); });
}

function sortItems() { loadItems(); }

function addRow(cover, name, creator, like, neutral, dislike, submitted, index, itemId) {
    const table = document.getElementById('itemTable');
    const row = table.insertRow();
    row.insertCell(0).textContent = index + 1;
    const coverCell = row.insertCell(1);
    const coverImage = document.createElement('img');
    coverImage.src = cover || ''; coverImage.width = 100; coverCell.appendChild(coverImage);
    row.insertCell(2).textContent = name;
    row.insertCell(3).textContent = creator;
    const ratingCell = row.insertCell(4);
    const likeContainer = document.createElement('div');
    const likeButton = document.createElement('button'); likeButton.textContent = 'Like';
    const likeCounter = document.createElement('div'); likeCounter.textContent = like;
    likeButton.onclick = function () { vote(itemId, 'like', likeButton, neutralButton, dislikeButton, likeCounter, neutralCounter, dislikeCounter, index); };
    likeContainer.appendChild(likeButton); likeContainer.appendChild(likeCounter);
    const neutralContainer = document.createElement('div');
    const neutralButton = document.createElement('button'); neutralButton.textContent = 'Neutral';
    const neutralCounter = document.createElement('div'); neutralCounter.textContent = neutral;
    neutralButton.onclick = function () { vote(itemId, 'neutral', likeButton, neutralButton, dislikeButton, likeCounter, neutralCounter, dislikeCounter, index); };
    neutralContainer.appendChild(neutralButton); neutralContainer.appendChild(neutralCounter);
    const dislikeContainer = document.createElement('div');
    const dislikeButton = document.createElement('button'); dislikeButton.textContent = 'Dislike';
    const dislikeCounter = document.createElement('div'); dislikeCounter.textContent = dislike;
    dislikeButton.onclick = function () { vote(itemId, 'dislike', likeButton, neutralButton, dislikeButton, likeCounter, neutralCounter, dislikeCounter, index); };
    dislikeContainer.appendChild(dislikeButton); dislikeContainer.appendChild(dislikeCounter);
    ratingCell.appendChild(likeContainer); ratingCell.appendChild(neutralContainer); ratingCell.appendChild(dislikeContainer);
    const timerText = document.createElement('div'); timerText.className = 'voting-timer'; ratingCell.appendChild(timerText);
    function updateVotingTimer() {
        const cooldowns = JSON.parse(localStorage.getItem('vote_cooldowns') || '{}');
        const unlockAt = cooldowns[itemId] || 0; const remaining = unlockAt - Date.now(); const locked = remaining > 0;
        likeButton.disabled = locked; neutralButton.disabled = locked; dislikeButton.disabled = locked;
        if (!locked) { timerText.textContent = 'Voting open'; timerText.classList.add('voting-open'); return; }
        const totalSec = Math.ceil(remaining / 1000);
        const h = Math.floor(totalSec / 3600); const m = Math.floor((totalSec % 3600) / 60); const s = totalSec % 60;
        timerText.textContent = `Voting opens in ${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
    }
    let timerInterval = null; updateVotingTimer();
    const cooldowns = JSON.parse(localStorage.getItem('vote_cooldowns') || '{}');
    if ((cooldowns[itemId] || 0) > Date.now()) { timerInterval = setInterval(updateVotingTimer, 1000); }
    const submittedText = document.createElement('div');
    submittedText.textContent = submitted ? 'Submitted: ' + submitted : 'Submitted: Unknown';
    submittedText.className = 'submitted-date'; ratingCell.appendChild(submittedText);
}

async function vote(itemId, voteType, likeBtn, neutralBtn, dislikeBtn, likeCtr, neutralCtr, dislikeCtr, index) {
    likeBtn.disabled = true; neutralBtn.disabled = true; dislikeBtn.disabled = true;
    try {
        const res = await fetch('/api/vote/' + itemId, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ person_id: personId, vote_type: voteType }) });
        const data = await res.json();
        if (!res.ok) { if (data.error === 'cooldown') { alert(data.message); } else { alert(data.error || 'Vote failed'); } likeBtn.disabled = false; neutralBtn.disabled = false; dislikeBtn.disabled = false; return; }
        likeCtr.textContent = data.like_count; neutralCtr.textContent = data.neutral_count; dislikeCtr.textContent = data.dislike_count;
        const cooldowns = JSON.parse(localStorage.getItem('vote_cooldowns') || '{}');
        cooldowns[itemId] = Date.now() + (24 * 60 * 60 * 1000);
        localStorage.setItem('vote_cooldowns', JSON.stringify(cooldowns));
        setTimeout(() => loadItems(), 500);
    } catch (e) { alert('Error: ' + e.message); likeBtn.disabled = false; neutralBtn.disabled = false; dislikeBtn.disabled = false; }
}

async function displayYearlyArchives() {
    try {
        const res = await fetch('/api/archives/' + CATEGORY); const data = await res.json();
        const archives = data.archives || []; const archiveList = document.getElementById('archiveList'); archiveList.innerHTML = '';
        archives.forEach(archive => {
            const archiveData = JSON.parse(archive.data);
            const date = new Date(archive.created_at).toLocaleDateString(); const year = new Date(archive.created_at).getFullYear();
            const details = document.createElement('details'); details.className = 'year-archive'; details.open = (archives.indexOf(archive) === 0);
            const summary = document.createElement('summary'); summary.textContent = year + ' Top 10'; details.appendChild(summary);
            const finalized = document.createElement('div'); finalized.className = 'archive-finalized'; finalized.textContent = 'Finalized: ' + date; details.appendChild(finalized);
            const list = document.createElement('ul'); list.className = 'archive-ranking-list';
            archiveData.items.forEach(item => {
                const li = document.createElement('li'); li.className = 'archive-item';
                if (item.cover) { const img = document.createElement('img'); img.className = 'archive-cover'; img.src = item.cover; li.appendChild(img); }
                const info = document.createElement('div'); info.innerHTML = `<strong>#${item.rank} ${item.name}</strong> — ${item.creator}<br>Likes: ${item.like_count} | Neutral: ${item.neutral_count} | Dislikes: ${item.dislike_count}`;
                li.appendChild(info); list.appendChild(li);
            });
            details.appendChild(list);
            const dlBtn = document.createElement('button'); dlBtn.textContent = 'Download as Image'; dlBtn.style.margin = '10px 0';
            dlBtn.onclick = function () { html2canvas(details).then(function (canvas) { var link = document.createElement('a'); link.download = CATEGORY + '-top10-' + year + '.png'; link.href = canvas.toDataURL(); link.click(); }); };
            details.appendChild(dlBtn); archiveList.appendChild(details);
        });
    } catch (e) { console.error('Archive load error:', e); }
}

async function archiveTop10() {
    try { const res = await fetch('/api/archive/' + CATEGORY, { method: 'POST' }); const data = await res.json(); if (!res.ok) { alert(data.error || 'Archive failed'); return; } alert('Archive created!'); displayYearlyArchives(); } catch (e) { alert('Error: ' + e.message); }
}
