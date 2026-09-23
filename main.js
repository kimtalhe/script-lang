import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getDatabase, ref, push, onValue, update, remove } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

// --- Firebase 설정 ---
const firebaseConfig = {
  databaseURL: "https://script01-d56c4-default-rtdb.firebaseio.com"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const ideasRef = ref(db, 'ideas');
const topicRef = ref(db, 'topic');

// --- 상태 관리 ---
// 사용자 클라이언트 ID (투표 중복 방지)
let clientId = localStorage.getItem('brainstorm_client_id');
if (!clientId) {
  clientId = 'user_' + Math.random().toString(36).substring(2, 9);
  localStorage.setItem('brainstorm_client_id', clientId);
}

let ideasData = {};
let currentModalIdeaId = null;
let animatingIdeaId = null;

// --- DOM 요소 ---
const board = document.getElementById('board');
const topicInput = document.getElementById('topic-input');
const ideaInput = document.getElementById('idea-input');
const submitBtn = document.getElementById('submit-btn');
const modalOverlay = document.getElementById('modal-overlay');
const commentInput = document.getElementById('comment-input');
const commentSubmitBtn = document.getElementById('comment-submit-btn');
const resetAllBtn = document.getElementById('reset-all-btn');

// --- TOP 3 모달 관련 요소 ---
const top3Btn = document.getElementById('top3-btn');
const top3ModalOverlay = document.getElementById('top3-modal-overlay');
const top3List = document.getElementById('top3-list');

// --- 🎨 파스텔톤 색상 생성 함수 ---
function getRandomPastelColor() {
  const hue = Math.floor(Math.random() * 360);
  const saturation = 70 + Math.floor(Math.random() * 20);
  const lightness = 85 + Math.floor(Math.random() * 10);
  return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
}

// --- 실시간 데이터 감지 (Firebase Listeners) ---
onValue(ideasRef, (snapshot) => {
  ideasData = snapshot.val() || {};
  renderBoard();
  if (currentModalIdeaId && ideasData[currentModalIdeaId]) {
    renderComments(ideasData[currentModalIdeaId]);
  }
});

onValue(topicRef, (snapshot) => {
  const topic = snapshot.val();
  if (topic && topicInput) topicInput.value = topic;
});

// --- 이벤트 리스너 ---
if (topicInput) {
  topicInput.addEventListener('change', () => {
    update(ref(db), { topic: topicInput.value });
  });
}

if (submitBtn) submitBtn.addEventListener('click', createIdea);

if (ideaInput) {
  ideaInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      createIdea();
    }
  });
}

if (commentSubmitBtn) commentSubmitBtn.addEventListener('click', addComment);

if (commentInput) {
  commentInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') addComment();
  });
}

if (modalOverlay) {
  modalOverlay.addEventListener('click', (e) => {
    if (e.target === modalOverlay) {
      modalOverlay.style.display = 'none';
      currentModalIdeaId = null;
    }
  });
}

// 🗑️ 전체 초기화 버튼 이벤트 (단일 onclick 바인딩으로 중복 차단)
if (resetAllBtn) {
  resetAllBtn.onclick = (e) => {
    e.preventDefault();
    e.stopPropagation();

    const confirmReset = confirm('등록된 모든 아이디어와 코멘트를 삭제하시겠습니까?\n이 작업은 복구할 수 없습니다.');

    if (confirmReset) {
      remove(ref(db, 'ideas'))
        .then(() => {
          alert('모든 아이디어가 초기화되었습니다.');
        })
        .catch((error) => {
          console.error("초기화 실패:", error);
          alert('초기화 중 오류가 발생했습니다.');
        });
    }
  };
}

// 🔥 TOP 3 버튼 클릭 및 모달 이벤트
if (top3Btn) {
  top3Btn.addEventListener('click', () => {
    renderTop3();
    if (top3ModalOverlay) top3ModalOverlay.style.display = 'flex';
  });
}

if (top3ModalOverlay) {
  top3ModalOverlay.addEventListener('click', (e) => {
    if (e.target === top3ModalOverlay) {
      top3ModalOverlay.style.display = 'none';
    }
  });
}

// --- 핵심 기능 함수 ---

function createIdea() {
  const text = ideaInput.value.trim();
  if (!text) return;

  const randomBgColor = getRandomPastelColor();

  push(ideasRef, {
    text: text,
    bgColor: randomBgColor,
    voters: {},
    comments: []
  });
  ideaInput.value = '';
}

// 🗑️ 개별 아이디어 카드 삭제 (Firebase DB 연동)
function deleteIdea(id, event) {
  event.stopPropagation(); // 모달 팝업 등 부모 이벤트 전달 방지

  if (confirm('이 아이디어를 삭제하시겠습니까?')) {
    remove(ref(db, `ideas/${id}`))
      .catch((error) => {
        console.error("삭제 실패:", error);
        alert('삭제 처리 중 오류가 발생했습니다.');
      });
  }
}

function voteIdea(id, event) {
  event.stopPropagation();
  const idea = ideasData[id];
  if (!idea) return;

  animatingIdeaId = id;

  const voters = idea.voters || {};
  if (voters[clientId]) {
    delete voters[clientId];
    update(ref(db, `ideas/${id}`), { voters: voters });
  } else {
    voters[clientId] = true;
    update(ref(db, `ideas/${id}/voters`), { [clientId]: true });
  }

  // 애니메이션 종료 후 상태 초기화
  setTimeout(() => {
    if (animatingIdeaId === id) {
      animatingIdeaId = null;
      renderBoard();
    }
  }, 350);
}

function renderBoard() {
  if (!board) return;
  board.innerHTML = '';

  Object.keys(ideasData).forEach(id => {
    const idea = ideasData[id];
    const voters = idea.voters ? Object.keys(idea.voters) : [];
    const voteCount = voters.length;
    const isVoted = idea.voters && idea.voters[clientId];
    const comments = idea.comments ? Object.values(idea.comments) : [];
    const bgColor = idea.bgColor || 'hsl(260, 85%, 92%)';

    const isAnimating = (animatingIdeaId === id);

    const box = document.createElement('div');
    box.className = `idea-box ${isAnimating ? 'anim-active' : ''}`;

    // 📱 모바일 화면(폭 768px 이하) 여부 체크
    const isMobile = window.innerWidth <= 768;

    // 모바일이면 100% 비율 기반, PC면 좋아요 수에 따른 가변 계산 유지
    const baseWidth = isMobile 
      ? Math.min(window.innerWidth - 32, 600) 
      : Math.min(240 + voteCount * 25, 600);

    const flexGrow = isMobile ? 0 : (1 + (voteCount * 0.5));
    const minHeight = isMobile ? 100 : Math.min(130 + voteCount * 15, 350);
    const fontSize = isMobile 
      ? Math.min(14 + voteCount * 0.8, 20) 
      : Math.min(15 + voteCount * 1.5, 32);
    const padding = isMobile ? 16 : Math.min(18 + voteCount * 2, 42);

    box.style.width = isMobile ? '100%' : `${baseWidth}px`;
    box.style.flexGrow = flexGrow;
    box.style.minHeight = `${minHeight}px`;
    box.style.fontSize = `${fontSize}px`;
    box.style.padding = `${padding}px`;
    box.style.backgroundColor = bgColor;

    // 카드 내부 구조 (삭제 버튼 + 아이디어 텍스트 + 하단 코멘트/좋아요)
    box.innerHTML = `
      <button class="delete-card-btn" title="삭제">✕</button>
      <div class="idea-text" style="word-break: break-word;">${idea.text}</div>
      <div class="idea-footer" style="margin-top: 16px;">
        <span>💬 코멘트 ${comments.length}</span>
        <div style="display:flex; gap:6px; align-items:center;">
          <button class="vote-btn main-vote-btn ${isVoted ? 'voted' : ''} ${isAnimating ? 'anim-active' : ''}">
            👍 ${voteCount}
          </button>
        </div>
      </div>
    `;

    // 삭제 버튼 이벤트 연결
    const deleteBtn = box.querySelector('.delete-card-btn');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', (e) => deleteIdea(id, e));
    }

    // 좋아요 버튼 이벤트 연결
    const voteBtn = box.querySelector('.main-vote-btn');
    if (voteBtn) {
      voteBtn.addEventListener('click', (e) => voteIdea(id, e));
    }

    // 더블클릭 시 코멘트 모달 열기
    box.addEventListener('dblclick', () => openModal(id));
    board.appendChild(box);
  });
}

function openModal(id) {
  currentModalIdeaId = id;
  const idea = ideasData[id];
  if (!idea) return;

  const titleElem = document.getElementById('modal-idea-text');
  if (titleElem) titleElem.textContent = `💡 "${idea.text}"`;
  
  renderComments(idea);
  if (modalOverlay) modalOverlay.style.display = 'flex';
}

function addComment() {
  const text = commentInput.value.trim();
  if (!text || !currentModalIdeaId) return;

  const commentRef = ref(db, `ideas/${currentModalIdeaId}/comments`);
  push(commentRef, text);
  commentInput.value = '';
}

function renderComments(idea) {
  const list = document.getElementById('comment-list');
  if (!list) return;

  list.innerHTML = '';
  const comments = idea.comments ? Object.values(idea.comments) : [];

  if (comments.length === 0) {
    list.innerHTML = `<div style="color:#9ca3af; text-align:center;">첫 코멘트를 남겨보세요!</div>`;
  } else {
    comments.forEach(c => {
      const item = document.createElement('div');
      item.className = 'comment-item';
      item.textContent = c;
      list.appendChild(item);
    });
  }
}

// 🔥 TOP 3 아이디어 정렬 및 렌더링 함수
function renderTop3() {
  if (!top3List) return;
  top3List.innerHTML = '';

  const ideasArray = Object.keys(ideasData).map(id => {
    const idea = ideasData[id];
    const voters = idea.voters ? Object.keys(idea.voters) : [];
    return {
      id: id,
      text: idea.text,
      bgColor: idea.bgColor || 'hsl(260, 85%, 92%)',
      voteCount: voters.length
    };
  });

  ideasArray.sort((a, b) => b.voteCount - a.voteCount);

  const top3 = ideasArray.slice(0, 3);

  if (top3.length === 0 || top3[0].voteCount === 0) {
    top3List.innerHTML = `<div style="color:#9ca3af; text-align:center; padding:20px;">아직 등록되거나 투표된 아이디어가 없습니다!</div>`;
    return;
  }

  const rankBadges = ['🥇', '🥈', '🥉'];

  top3.forEach((item, index) => {
    const el = document.createElement('div');
    el.className = 'top3-item';
    el.style.backgroundColor = item.bgColor;

    el.innerHTML = `
      <span class="top3-rank">${rankBadges[index] || index + 1}</span>
      <span class="top3-text">${item.text}</span>
      <span class="top3-count">👍 ${item.voteCount}</span>
    `;

    top3List.appendChild(el);
  });
}