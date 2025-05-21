export function initReferencesTab(container) {
  const referencesContainer = container.querySelector('.references-container');
  const refList = referencesContainer.querySelector('.ref-list');
  const refDetails = referencesContainer.querySelector('.ref-details');
  const refDetailsContent = refDetails.querySelector('.ref-details-content');
  const refSearch = referencesContainer.querySelector('.ref-search');
  const addRefBtn = referencesContainer.querySelector('.add-ref-btn');

  // 文献数据示例
  let references = [
    {
      id: 1,
      title: 'Scaling Laws in Scientific Discovery with AI and Robot Scientists',
      authors: 'Zhang, Pengsong et al.',
      year: 2025,
      journal: 'arXiv',
      url: 'https://arxiv.org/abs/2503.22444',
      abstract: 'This paper discusses scaling laws in scientific discovery and explores how AI and robotic systems can accelerate the process of scientific research through automated experimentation and hypothesis generation.'
    },
    {
      id: 2,
      title: 'Autonomous Generalist Scientist: Towards and Beyond Human-Level Scientific Research',
      authors: 'Zhang, Pengsong et al.',
      year: 2024,
      journal: 'ResearchGate',
      url: 'https://www.researchgate.net/publication/379148019',
      abstract: 'This work proposes a framework for autonomous research agents that can perform scientific research tasks at or beyond human level, integrating large language models, robotic systems, and automated experimentation platforms.'
    }
  ];

  let filteredReferences = references;

  function renderReferenceList() {
    refList.innerHTML = '';
    if (filteredReferences.length === 0) {
      refList.innerHTML = '<div style="color:var(--text-muted);padding:1rem;">No references found</div>';
      return;
    }

    const ul = document.createElement('ul');
    ul.className = 'reference-list';

    filteredReferences.forEach(ref => {
      const li = document.createElement('li');
      li.className = 'reference-item';
      li.innerHTML = `
        <div class="ref-title">${ref.title}</div>
        <div class="ref-meta">${ref.authors} • ${ref.journal} • ${ref.year}</div>
      `;
      li.addEventListener('click', () => showReferenceDetails(ref));
      ul.appendChild(li);
    });

    refList.appendChild(ul);
  }

  function showReferenceDetails(ref) {
    refDetails.querySelector('h3').textContent = ref.title;
    refDetailsContent.innerHTML = `
      <div class="ref-details-field">
        <div class="ref-details-label">Authors</div>
        <div class="ref-details-value">${ref.authors}</div>
      </div>
      <div class="ref-details-field">
        <div class="ref-details-label">Journal</div>
        <div class="ref-details-value">${ref.journal}</div>
      </div>
      <div class="ref-details-field">
        <div class="ref-details-label">Year</div>
        <div class="ref-details-value">${ref.year}</div>
      </div>
      <div class="ref-details-field">
        <div class="ref-details-label">URL</div>
        <div class="ref-details-value">
          <a href="${ref.url}" target="_blank">${ref.url}</a>
        </div>
      </div>
      <div class="ref-details-field">
        <div class="ref-details-label">Abstract</div>
        <div class="ref-details-value">${ref.abstract}</div>
      </div>
      <button class="delete-ref-btn">Delete Reference</button>
    `;

    refDetailsContent.querySelector('.delete-ref-btn').onclick = () => {
      references = references.filter(r => r.id !== ref.id);
      filteredReferences = references;
      renderReferenceList();
      refDetails.querySelector('h3').textContent = 'Select a reference to view details';
      refDetailsContent.innerHTML = '';
    };
  }

  refSearch.addEventListener('input', () => {
    const query = refSearch.value.trim().toLowerCase();
    filteredReferences = references.filter(ref =>
      ref.title.toLowerCase().includes(query) ||
      ref.authors.toLowerCase().includes(query) ||
      String(ref.year).includes(query) ||
      ref.journal.toLowerCase().includes(query) ||
      ref.abstract.toLowerCase().includes(query)
    );
    renderReferenceList();
  });

  addRefBtn.addEventListener('click', () => {
    const title = prompt('Paper Title:');
    if (!title) return;
    
    const authors = prompt('Authors:');
    const year = prompt('Year:');
    const journal = prompt('Journal:');
    const url = prompt('URL:');
    const abstract = prompt('Abstract:');

    if (authors && year && journal) {
      const newRef = {
        id: Date.now(),
        title,
        authors,
        year,
        journal,
        url: url || '',
        abstract: abstract || ''
      };
      
      references.push(newRef);
      filteredReferences = references;
      renderReferenceList();
      showReferenceDetails(newRef);
    }
  });

  // 初始化渲染
  renderReferenceList();
}
