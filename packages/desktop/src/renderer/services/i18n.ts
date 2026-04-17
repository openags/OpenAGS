/**
 * Lightweight i18n system — 7 languages.
 *
 * Usage:
 *   const { t, locale, setLocale, LOCALES } = useLocale()
 *   t('settings.title')  // → "Settings" / "设置" / "設定" / ...
 */

import { useCallback, useEffect, useState } from 'react'

export type Locale = 'en' | 'zh' | 'ja' | 'fr' | 'de' | 'ar'

export interface LocaleOption {
  code: Locale
  label: string
  nativeLabel: string
}

export const LOCALES: LocaleOption[] = [
  { code: 'en', label: 'English', nativeLabel: 'English' },
  { code: 'zh', label: 'Chinese', nativeLabel: '中文' },
  { code: 'ja', label: 'Japanese', nativeLabel: '日本語' },
  { code: 'fr', label: 'French', nativeLabel: 'Français' },
  { code: 'de', label: 'German', nativeLabel: 'Deutsch' },
  { code: 'ar', label: 'Arabic', nativeLabel: 'العربية' },
]

const STORAGE_KEY = 'openags-locale'

type Dict = Record<string, string | Record<string, string | Record<string, string>>>

function flatten(obj: Dict, prefix = ''): Record<string, string> {
  const result: Record<string, string> = {}
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k
    if (typeof v === 'string') {
      result[key] = v
    } else {
      Object.assign(result, flatten(v as Dict, key))
    }
  }
  return result
}

// ── English (base) ──────────────────────────────────

const en: Dict = {
  settings: {
    title: 'Settings',
    saveAll: 'Save All Changes',
    backendSection: 'Agent Backend',
    backendType: 'Backend Type',
    backendTypeHint: 'Choose which backend executes agent tasks',
    model: 'Model',
    modelHint: 'e.g. claude-sonnet-4-6, gpt-4o, deepseek/deepseek-chat',
    defaultApiKey: 'Default API Key',
    keySet: 'Key is set (enter new value to change)',
    noKey: 'No key configured',
    cliInfo: 'is a CLI-based backend',
    cliDetail: 'CLI backends use their own authentication. Make sure the CLI tool is installed.',
    timeout: 'Timeout (seconds)',
    generalSection: 'General',
    workspace: 'Workspace Directory',
    logLevel: 'Log Level',
    tokenBudget: 'Token Budget (USD)',
    tokenBudgetHint: 'Leave empty for no limit',
    configInfo: 'Configuration',
    configDetail: 'Changes are saved to your local config file and take effect immediately.',
    language: 'Language',
    languageHint: 'Interface display language',
    testConnection: 'Test Connection',
    testing: 'Testing...',
    connected: 'Connected',
    connectionFailed: 'Connection failed',
    selectModel: 'Select model',
    customModel: 'Custom model name',
    theme: 'Theme',
    provider: 'Provider',
    apiKey: 'API Key',
    modelOverride: 'Model (optional override)',
    baseUrl: 'Base URL (custom provider only)',
    saveToConfig: 'Save to config file',
    saved: 'Saved!',
    configWritten: 'Config is written directly to the CLI tool\'s own config file. Changes take effect on next session.',
  },
  compute: {
    title: 'Compute & Servers',
    localGpu: 'Local GPU',
    noGpu: 'No GPU detected (CPU only)',
    gpuDetected: 'GPU(s) detected',
    refresh: 'Refresh',
    remoteServers: 'Remote Servers',
    remoteServersHint: 'SSH servers for running experiments',
    addServer: 'Add Server',
    testConnection: 'Test Connection',
    delete: 'Delete',
    defaultExecution: 'Default Execution Mode',
    executionHint: 'Where experiments run by default',
    local: 'Local',
    docker: 'Docker',
    remoteSsh: 'Remote SSH',
    name: 'Name',
    host: 'Host',
    port: 'Port',
    username: 'Username',
    keyFile: 'Key file',
    save: 'Save',
    cancel: 'Cancel',
  },
  manuscript: {
    files: 'Files',
    newFile: 'New file',
    newFolder: 'New folder',
    refresh: 'Refresh',
    hideTree: 'Hide file tree',
    showTree: 'Show file tree',
    save: 'Save',
    compile: 'Compile',
    compiling: 'Compiling...',
    preview: 'Preview',
    hidePreview: 'Hide Preview',
    selectFile: 'Select a file to edit',
    selectFileHint: 'Right-click in file tree to create files',
    unsaved: 'unsaved',
    viewLog: 'View compile log',
    pdfPreview: 'PDF Preview',
    compileToSee: 'Compile to see PDF preview',
    enterFileName: 'Enter file name...',
    enterFolderName: 'Enter folder name...',
    confirmDelete: 'Confirm delete?',
    cancel: 'Cancel',
    delete: 'Delete',
    rename: 'Rename',
    enterNewName: 'Enter new name...',
    createFailed: 'Create failed',
    deleteFailed: 'Delete failed',
  },
  nav: {
    projects: 'Projects',
    skills: 'Skills',
    settings: 'Settings',
    logs: 'Logs',
    searchProjects: 'Search projects...',
    noProjects: 'No projects yet',
    newChat: 'New Chat',
    editProject: 'Edit',
    projectName: 'Project Name',
    description: 'Description',
  },
  dashboard: {
    title: 'Projects',
    createProject: 'Create Project',
    noProjects: 'No projects yet. Create one to get started.',
    deleteConfirm: 'Delete this project? This cannot be undone.',
    renameProject: 'Rename project',
  },
  project: {
    pi: 'PI',
    literature: 'Literature',
    proposal: 'Proposal',
    experiments: 'Experiments',
    manuscript: 'Manuscript',
    review: 'Review',
    rebuttal: 'Rebuttal',
    presentation: 'Presentation',
    references: 'References',
    config: 'Config',
    sendMessage: 'Send message',
    enterToSend: 'Enter to send',
    shiftEnter: 'Shift+Enter for new line',
    startConversation: 'Start a conversation',
    openTerminal: 'Open Terminal',
    closeTerminal: 'Close Terminal',
    attachFiles: 'Attach files',
  },
  common: {
    save: 'Save',
    cancel: 'Cancel',
    delete: 'Delete',
    rename: 'Rename',
    confirm: 'Confirm',
    loading: 'Loading...',
    saved: 'Saved',
    failed: 'Failed',
    error: 'Error',
    success: 'Success',
  },
}

// ── Chinese ─────────────────────────────────────────

const zh: Dict = {
  settings: {
    title: '设置',
    saveAll: '保存所有更改',
    backendSection: 'Agent 后端',
    backendType: '后端类型',
    backendTypeHint: '选择执行 Agent 任务的后端',
    model: '模型',
    modelHint: '如 claude-sonnet-4-6, gpt-4o, deepseek/deepseek-chat',
    defaultApiKey: '默认 API Key',
    keySet: 'Key 已设置（输入新值以更换）',
    noKey: '未配置 Key',
    cliInfo: '是 CLI 类型后端',
    cliDetail: 'CLI 后端使用自身的认证方式。请确保对应 CLI 工具已安装。',
    timeout: '超时时间（秒）',
    generalSection: '通用',
    workspace: '工作目录',
    logLevel: '日志级别',
    tokenBudget: 'Token 预算（美元）',
    tokenBudgetHint: '留空表示无限制',
    configInfo: '配置信息',
    configDetail: '更改会保存到本地配置文件并立即生效。',
    language: '语言',
    languageHint: '界面显示语言',
    testConnection: '测试连接',
    testing: '测试中...',
    connected: '已连接',
    connectionFailed: '连接失败',
    selectModel: '选择模型',
    customModel: '自定义模型名称',
    theme: '主题',
    provider: '提供商',
    apiKey: 'API 密钥',
    modelOverride: '模型（可选覆盖）',
    baseUrl: 'Base URL（仅自定义提供商）',
    saveToConfig: '保存到配置文件',
    saved: '已保存！',
    configWritten: '配置直接写入 CLI 工具的配置文件，下次会话生效。',
  },
  compute: {
    title: '计算与服务器',
    localGpu: '本地 GPU',
    noGpu: '未检测到 GPU（仅 CPU）',
    gpuDetected: '个 GPU 已检测到',
    refresh: '刷新',
    remoteServers: '远程服务器',
    remoteServersHint: '用于运行实验的 SSH 服务器',
    addServer: '添加服务器',
    testConnection: '测试连接',
    delete: '删除',
    defaultExecution: '默认执行模式',
    executionHint: '实验默认运行位置',
    local: '本地',
    docker: 'Docker',
    remoteSsh: '远程 SSH',
    name: '名称',
    host: '主机',
    port: '端口',
    username: '用户名',
    keyFile: '密钥文件',
    save: '保存',
    cancel: '取消',
  },
  manuscript: {
    files: '文件',
    newFile: '新建文件',
    newFolder: '新建文件夹',
    refresh: '刷新',
    hideTree: '隐藏文件树',
    showTree: '显示文件树',
    save: '保存',
    compile: '编译',
    compiling: '编译中...',
    preview: '预览',
    hidePreview: '隐藏预览',
    selectFile: '选择文件以编辑',
    selectFileHint: '右键点击文件树可创建文件',
    unsaved: '未保存',
    viewLog: '查看编译日志',
    pdfPreview: 'PDF 预览',
    compileToSee: '编译后查看 PDF 预览',
    enterFileName: '输入文件名...',
    enterFolderName: '输入文件夹名...',
    confirmDelete: '确认删除？',
    cancel: '取消',
    delete: '删除',
    rename: '重命名',
    enterNewName: '输入新名称...',
    createFailed: '创建失败',
    deleteFailed: '删除失败',
  },
  nav: {
    projects: '项目',
    skills: '技能',
    settings: '设置',
    logs: '日志',
    searchProjects: '搜索项目...',
    noProjects: '暂无项目',
    newChat: '新建对话',
    editProject: '编辑',
    projectName: '项目名称',
    description: '描述',
  },
  dashboard: {
    title: '项目',
    createProject: '创建项目',
    noProjects: '暂无项目，创建一个开始吧。',
    deleteConfirm: '删除此项目？此操作不可撤销。',
    renameProject: '重命名项目',
  },
  project: {
    pi: 'PI',
    literature: '文献',
    proposal: '提案',
    experiments: '实验',
    manuscript: '论文',
    review: '审稿',
    rebuttal: '答辩',
    presentation: '演示',
    references: '引用',
    config: '配置',
    sendMessage: '发送消息',
    enterToSend: '按回车发送',
    shiftEnter: 'Shift+Enter 换行',
    startConversation: '开始对话',
    openTerminal: '打开终端',
    closeTerminal: '关闭终端',
    attachFiles: '附加文件',
  },
  common: {
    save: '保存',
    cancel: '取消',
    delete: '删除',
    rename: '重命名',
    confirm: '确认',
    loading: '加载中...',
    saved: '已保存',
    failed: '失败',
    error: '错误',
    success: '成功',
  },
}

// ── Japanese ────────────────────────────────────────

const ja: Dict = {
  settings: {
    title: '設定',
    saveAll: 'すべての変更を保存',
    backendSection: 'エージェントバックエンド',
    backendType: 'バックエンドタイプ',
    backendTypeHint: 'エージェントタスクを実行するバックエンドを選択',
    model: 'モデル',
    modelHint: '例: claude-sonnet-4-6, gpt-4o, deepseek/deepseek-chat',
    defaultApiKey: 'デフォルト API キー',
    keySet: 'キー設定済み（新しい値を入力して変更）',
    noKey: 'キー未設定',
    cliInfo: 'はCLIベースのバックエンドです',
    cliDetail: 'CLIバックエンドは独自の認証を使用します。CLIツールがインストールされていることを確認してください。',
    timeout: 'タイムアウト（秒）',
    generalSection: '一般',
    workspace: 'ワークスペースディレクトリ',
    logLevel: 'ログレベル',
    tokenBudget: 'トークン予算（USD）',
    tokenBudgetHint: '制限なしの場合は空欄',
    configInfo: '設定情報',
    configDetail: '変更はローカル設定ファイルに保存され、すぐに反映されます。',
    language: '言語',
    languageHint: 'インターフェース表示言語',
    testConnection: '接続テスト',
    testing: 'テスト中...',
    connected: '接続済み',
    connectionFailed: '接続失敗',
    selectModel: 'モデルを選択',
    customModel: 'カスタムモデル名',
    theme: 'テーマ',
    provider: 'プロバイダー',
    apiKey: 'APIキー',
    modelOverride: 'モデル（オプション）',
    baseUrl: 'ベースURL（カスタムプロバイダーのみ）',
    saveToConfig: '設定ファイルに保存',
    saved: '保存しました！',
    configWritten: '設定はCLIツールの設定ファイルに直接書き込まれます。次のセッションで有効になります。',
  },
  compute: {
    title: 'コンピュート＆サーバー',
    localGpu: 'ローカルGPU',
    noGpu: 'GPUが検出されません（CPUのみ）',
    gpuDetected: '個のGPUを検出',
    refresh: '更新',
    remoteServers: 'リモートサーバー',
    remoteServersHint: '実験実行用SSHサーバー',
    addServer: 'サーバーを追加',
    testConnection: '接続テスト',
    delete: '削除',
    defaultExecution: 'デフォルト実行モード',
    executionHint: '実験のデフォルト実行場所',
    local: 'ローカル',
    docker: 'Docker',
    remoteSsh: 'リモートSSH',
    name: '名前',
    host: 'ホスト',
    port: 'ポート',
    username: 'ユーザー名',
    keyFile: 'キーファイル',
    save: '保存',
    cancel: 'キャンセル',
  },
  manuscript: {
    files: 'ファイル', newFile: '新規ファイル', newFolder: '新規フォルダ', refresh: '更新',
    hideTree: 'ファイルツリーを隠す', showTree: 'ファイルツリーを表示',
    save: '保存', compile: 'コンパイル', compiling: 'コンパイル中...', preview: 'プレビュー',
    hidePreview: 'プレビューを隠す', selectFile: '編集するファイルを選択', selectFileHint: '右クリックでファイルを作成',
    unsaved: '未保存', viewLog: 'コンパイルログを見る', pdfPreview: 'PDFプレビュー',
    compileToSee: 'コンパイルしてPDFプレビューを表示', enterFileName: 'ファイル名を入力...',
    enterFolderName: 'フォルダ名を入力...', confirmDelete: '削除しますか？', cancel: 'キャンセル',
    delete: '削除', rename: '名前変更', enterNewName: '新しい名前を入力...', createFailed: '作成失敗', deleteFailed: '削除失敗',
  },
  nav: {
    projects: 'プロジェクト', skills: 'スキル', settings: '設定', logs: 'ログ',
    searchProjects: 'プロジェクトを検索...', noProjects: 'プロジェクトがありません',
    newChat: '新規チャット', editProject: '編集', projectName: 'プロジェクト名', description: '説明',
  },
  dashboard: {
    title: 'プロジェクト', createProject: 'プロジェクト作成',
    noProjects: 'プロジェクトがありません。作成して始めましょう。',
    deleteConfirm: 'このプロジェクトを削除しますか？元に戻せません。', renameProject: 'プロジェクト名変更',
  },
  project: {
    pi: 'PI', literature: '文献', proposal: '提案', experiments: '実験',
    manuscript: '論文', review: '査読', rebuttal: 'リバッタル', presentation: 'プレゼン', references: '参考文献', config: '設定',
    sendMessage: 'メッセージを送信', enterToSend: 'Enterで送信', shiftEnter: 'Shift+Enterで改行',
    startConversation: '会話を開始', openTerminal: 'ターミナルを開く', closeTerminal: 'ターミナルを閉じる',
    attachFiles: 'ファイルを添付',
  },
  common: {
    save: '保存', cancel: 'キャンセル', delete: '削除', rename: '名前変更', confirm: '確認',
    loading: '読み込み中...', saved: '保存済み', failed: '失敗', error: 'エラー', success: '成功',
  },
}

// ── French ──────────────────────────────────────────

const fr: Dict = {
  settings: {
    title: 'Paramètres', saveAll: 'Enregistrer tout', backendSection: 'Backend Agent',
    backendType: 'Type de backend', backendTypeHint: 'Choisir le backend pour les tâches agent',
    model: 'Modèle', modelHint: 'ex: claude-sonnet-4-6, gpt-4o', defaultApiKey: 'Clé API par défaut',
    keySet: 'Clé définie (entrez une nouvelle valeur)', noKey: 'Aucune clé configurée',
    cliInfo: 'est un backend CLI', cliDetail: 'Les backends CLI utilisent leur propre authentification.',
    timeout: 'Délai (secondes)', generalSection: 'Général', workspace: 'Répertoire de travail',
    logLevel: 'Niveau de log', tokenBudget: 'Budget tokens (USD)', tokenBudgetHint: 'Vide = illimité',
    configInfo: 'Configuration', configDetail: 'Les modifications sont enregistrées et prennent effet immédiatement.',
    language: 'Langue', languageHint: 'Langue d\'affichage', testConnection: 'Tester la connexion',
    testing: 'Test en cours...', connected: 'Connecté', connectionFailed: 'Échec de connexion',
    selectModel: 'Sélectionner un modèle', customModel: 'Nom de modèle personnalisé',
    theme: 'Thème', provider: 'Fournisseur', apiKey: 'Clé API', modelOverride: 'Modèle (optionnel)',
    baseUrl: 'URL de base (fournisseur personnalisé)', saveToConfig: 'Enregistrer dans le fichier config',
    saved: 'Enregistré !', configWritten: 'La configuration est écrite dans le fichier config du CLI.',
  },
  compute: {
    title: 'Calcul & Serveurs', localGpu: 'GPU local', noGpu: 'Aucun GPU détecté (CPU uniquement)',
    gpuDetected: 'GPU détecté(s)', refresh: 'Actualiser', remoteServers: 'Serveurs distants',
    remoteServersHint: 'Serveurs SSH pour les expériences', addServer: 'Ajouter un serveur',
    testConnection: 'Tester', delete: 'Supprimer', defaultExecution: 'Mode d\'exécution par défaut',
    executionHint: 'Où les expériences s\'exécutent par défaut', local: 'Local', docker: 'Docker',
    remoteSsh: 'SSH distant', name: 'Nom', host: 'Hôte', port: 'Port', username: 'Utilisateur',
    keyFile: 'Fichier de clé', save: 'Enregistrer', cancel: 'Annuler',
  },
  manuscript: {
    files: 'Fichiers', newFile: 'Nouveau fichier', newFolder: 'Nouveau dossier', refresh: 'Actualiser',
    hideTree: 'Masquer l\'arbre', showTree: 'Afficher l\'arbre', save: 'Enregistrer',
    compile: 'Compiler', compiling: 'Compilation...', preview: 'Aperçu', hidePreview: 'Masquer l\'aperçu',
    selectFile: 'Sélectionner un fichier', selectFileHint: 'Clic droit pour créer',
    unsaved: 'non enregistré', viewLog: 'Voir le log', pdfPreview: 'Aperçu PDF',
    compileToSee: 'Compiler pour voir le PDF', enterFileName: 'Nom du fichier...',
    enterFolderName: 'Nom du dossier...', confirmDelete: 'Confirmer la suppression ?',
    cancel: 'Annuler', delete: 'Supprimer', rename: 'Renommer', enterNewName: 'Nouveau nom...',
    createFailed: 'Échec de création', deleteFailed: 'Échec de suppression',
  },
  nav: {
    projects: 'Projets', skills: 'Compétences', settings: 'Paramètres', logs: 'Logs',
    searchProjects: 'Rechercher...', noProjects: 'Aucun projet', newChat: 'Nouveau chat',
    editProject: 'Modifier', projectName: 'Nom du projet', description: 'Description',
  },
  dashboard: {
    title: 'Projets', createProject: 'Créer un projet',
    noProjects: 'Aucun projet. Créez-en un pour commencer.',
    deleteConfirm: 'Supprimer ce projet ? Irréversible.', renameProject: 'Renommer le projet',
  },
  project: {
    pi: 'PI', literature: 'Littérature', proposal: 'Proposition', experiments: 'Expériences',
    manuscript: 'Manuscrit', review: 'Évaluation', rebuttal: 'Réfutation', presentation: 'Présentation', references: 'Références', config: 'Config',
    sendMessage: 'Envoyer', enterToSend: 'Entrée pour envoyer', shiftEnter: 'Shift+Entrée pour nouvelle ligne',
    startConversation: 'Démarrer une conversation', openTerminal: 'Ouvrir le terminal',
    closeTerminal: 'Fermer le terminal', attachFiles: 'Joindre des fichiers',
  },
  common: {
    save: 'Enregistrer', cancel: 'Annuler', delete: 'Supprimer', rename: 'Renommer', confirm: 'Confirmer',
    loading: 'Chargement...', saved: 'Enregistré', failed: 'Échoué', error: 'Erreur', success: 'Succès',
  },
}

// ── German ──────────────────────────────────────────

const de: Dict = {
  settings: {
    title: 'Einstellungen', saveAll: 'Alle Änderungen speichern', backendSection: 'Agent-Backend',
    backendType: 'Backend-Typ', backendTypeHint: 'Backend für Agent-Aufgaben wählen',
    model: 'Modell', modelHint: 'z.B. claude-sonnet-4-6, gpt-4o', defaultApiKey: 'Standard-API-Schlüssel',
    keySet: 'Schlüssel gesetzt (neuen Wert eingeben)', noKey: 'Kein Schlüssel konfiguriert',
    cliInfo: 'ist ein CLI-basiertes Backend', cliDetail: 'CLI-Backends verwenden eigene Authentifizierung.',
    timeout: 'Zeitlimit (Sekunden)', generalSection: 'Allgemein', workspace: 'Arbeitsverzeichnis',
    logLevel: 'Log-Level', tokenBudget: 'Token-Budget (USD)', tokenBudgetHint: 'Leer = unbegrenzt',
    configInfo: 'Konfiguration', configDetail: 'Änderungen werden sofort wirksam.',
    language: 'Sprache', languageHint: 'Anzeigesprache', testConnection: 'Verbindung testen',
    testing: 'Teste...', connected: 'Verbunden', connectionFailed: 'Verbindung fehlgeschlagen',
    selectModel: 'Modell wählen', customModel: 'Eigener Modellname',
    theme: 'Theme', provider: 'Anbieter', apiKey: 'API-Schlüssel', modelOverride: 'Modell (optional)',
    baseUrl: 'Basis-URL (nur eigener Anbieter)', saveToConfig: 'In Konfigurationsdatei speichern',
    saved: 'Gespeichert!', configWritten: 'Konfiguration wird direkt in die CLI-Konfigurationsdatei geschrieben.',
  },
  compute: {
    title: 'Compute & Server', localGpu: 'Lokale GPU', noGpu: 'Keine GPU erkannt (nur CPU)',
    gpuDetected: 'GPU(s) erkannt', refresh: 'Aktualisieren', remoteServers: 'Remote-Server',
    remoteServersHint: 'SSH-Server für Experimente', addServer: 'Server hinzufügen',
    testConnection: 'Testen', delete: 'Löschen', defaultExecution: 'Standard-Ausführungsmodus',
    executionHint: 'Wo Experimente standardmäßig ausgeführt werden', local: 'Lokal', docker: 'Docker',
    remoteSsh: 'Remote SSH', name: 'Name', host: 'Host', port: 'Port', username: 'Benutzername',
    keyFile: 'Schlüsseldatei', save: 'Speichern', cancel: 'Abbrechen',
  },
  manuscript: {
    files: 'Dateien', newFile: 'Neue Datei', newFolder: 'Neuer Ordner', refresh: 'Aktualisieren',
    hideTree: 'Dateibaum ausblenden', showTree: 'Dateibaum anzeigen', save: 'Speichern',
    compile: 'Kompilieren', compiling: 'Kompiliert...', preview: 'Vorschau', hidePreview: 'Vorschau ausblenden',
    selectFile: 'Datei zum Bearbeiten wählen', selectFileHint: 'Rechtsklick zum Erstellen',
    unsaved: 'nicht gespeichert', viewLog: 'Kompilierungslog anzeigen', pdfPreview: 'PDF-Vorschau',
    compileToSee: 'Kompilieren für PDF-Vorschau', enterFileName: 'Dateiname eingeben...',
    enterFolderName: 'Ordnername eingeben...', confirmDelete: 'Wirklich löschen?',
    cancel: 'Abbrechen', delete: 'Löschen', rename: 'Umbenennen', enterNewName: 'Neuen Namen eingeben...',
    createFailed: 'Erstellung fehlgeschlagen', deleteFailed: 'Löschung fehlgeschlagen',
  },
  nav: {
    projects: 'Projekte', skills: 'Fähigkeiten', settings: 'Einstellungen', logs: 'Logs',
    searchProjects: 'Projekte suchen...', noProjects: 'Keine Projekte', newChat: 'Neuer Chat',
    editProject: 'Bearbeiten', projectName: 'Projektname', description: 'Beschreibung',
  },
  dashboard: {
    title: 'Projekte', createProject: 'Projekt erstellen',
    noProjects: 'Keine Projekte. Erstellen Sie eines.', deleteConfirm: 'Projekt löschen? Nicht rückgängig.',
    renameProject: 'Projekt umbenennen',
  },
  project: {
    pi: 'PI', literature: 'Literatur', proposal: 'Vorschlag', experiments: 'Experimente',
    manuscript: 'Manuskript', review: 'Begutachtung', rebuttal: 'Erwiderung', presentation: 'Präsentation', references: 'Referenzen', config: 'Konfiguration',
    sendMessage: 'Nachricht senden', enterToSend: 'Enter zum Senden', shiftEnter: 'Shift+Enter für neue Zeile',
    startConversation: 'Gespräch beginnen', openTerminal: 'Terminal öffnen',
    closeTerminal: 'Terminal schließen', attachFiles: 'Dateien anhängen',
  },
  common: {
    save: 'Speichern', cancel: 'Abbrechen', delete: 'Löschen', rename: 'Umbenennen', confirm: 'Bestätigen',
    loading: 'Laden...', saved: 'Gespeichert', failed: 'Fehlgeschlagen', error: 'Fehler', success: 'Erfolg',
  },
}

// ── Arabic ──────────────────────────────────────────

const ar: Dict = {
  settings: {
    title: 'الإعدادات', saveAll: 'حفظ جميع التغييرات', backendSection: 'الواجهة الخلفية',
    backendType: 'نوع الواجهة', backendTypeHint: 'اختر الواجهة الخلفية لتنفيذ المهام',
    model: 'النموذج', modelHint: 'مثال: claude-sonnet-4-6, gpt-4o', defaultApiKey: 'مفتاح API الافتراضي',
    keySet: 'تم تعيين المفتاح (أدخل قيمة جديدة للتغيير)', noKey: 'لم يتم تكوين مفتاح',
    cliInfo: 'واجهة خلفية قائمة على CLI', cliDetail: 'تستخدم واجهات CLI مصادقتها الخاصة.',
    timeout: 'المهلة (ثوانٍ)', generalSection: 'عام', workspace: 'دليل العمل',
    logLevel: 'مستوى السجل', tokenBudget: 'ميزانية الرموز (دولار)', tokenBudgetHint: 'اتركه فارغاً للا حدود',
    configInfo: 'التكوين', configDetail: 'يتم حفظ التغييرات وتطبيقها فوراً.',
    language: 'اللغة', languageHint: 'لغة العرض', testConnection: 'اختبار الاتصال',
    testing: 'جارٍ الاختبار...', connected: 'متصل', connectionFailed: 'فشل الاتصال',
    selectModel: 'اختر النموذج', customModel: 'اسم نموذج مخصص',
    theme: 'السمة', provider: 'المزود', apiKey: 'مفتاح API', modelOverride: 'النموذج (اختياري)',
    baseUrl: 'عنوان URL الأساسي (مزود مخصص فقط)', saveToConfig: 'حفظ في ملف التكوين',
    saved: 'تم الحفظ!', configWritten: 'يتم كتابة التكوين مباشرة في ملف تكوين أداة CLI.',
  },
  compute: {
    title: 'الحوسبة والخوادم', localGpu: 'GPU محلي', noGpu: 'لم يتم اكتشاف GPU (CPU فقط)',
    gpuDetected: 'GPU مكتشف', refresh: 'تحديث', remoteServers: 'خوادم بعيدة',
    remoteServersHint: 'خوادم SSH لتشغيل التجارب', addServer: 'إضافة خادم',
    testConnection: 'اختبار', delete: 'حذف', defaultExecution: 'وضع التنفيذ الافتراضي',
    executionHint: 'أين تعمل التجارب افتراضياً', local: 'محلي', docker: 'Docker',
    remoteSsh: 'SSH بعيد', name: 'الاسم', host: 'المضيف', port: 'المنفذ', username: 'اسم المستخدم',
    keyFile: 'ملف المفتاح', save: 'حفظ', cancel: 'إلغاء',
  },
  manuscript: {
    files: 'ملفات', newFile: 'ملف جديد', newFolder: 'مجلد جديد', refresh: 'تحديث',
    hideTree: 'إخفاء شجرة الملفات', showTree: 'عرض شجرة الملفات', save: 'حفظ',
    compile: 'تجميع', compiling: 'جارٍ التجميع...', preview: 'معاينة', hidePreview: 'إخفاء المعاينة',
    selectFile: 'اختر ملفاً للتحرير', selectFileHint: 'انقر بزر الماوس الأيمن للإنشاء',
    unsaved: 'غير محفوظ', viewLog: 'عرض سجل التجميع', pdfPreview: 'معاينة PDF',
    compileToSee: 'جمّع لعرض معاينة PDF', enterFileName: 'أدخل اسم الملف...',
    enterFolderName: 'أدخل اسم المجلد...', confirmDelete: 'تأكيد الحذف؟',
    cancel: 'إلغاء', delete: 'حذف', rename: 'إعادة تسمية', enterNewName: 'أدخل الاسم الجديد...',
    createFailed: 'فشل الإنشاء', deleteFailed: 'فشل الحذف',
  },
  nav: {
    projects: 'المشاريع', skills: 'المهارات', settings: 'الإعدادات', logs: 'السجلات',
    searchProjects: 'البحث في المشاريع...', noProjects: 'لا توجد مشاريع', newChat: 'محادثة جديدة',
    editProject: 'تعديل', projectName: 'اسم المشروع', description: 'الوصف',
  },
  dashboard: {
    title: 'المشاريع', createProject: 'إنشاء مشروع',
    noProjects: 'لا توجد مشاريع. أنشئ واحداً للبدء.', deleteConfirm: 'حذف هذا المشروع؟ لا يمكن التراجع.',
    renameProject: 'إعادة تسمية المشروع',
  },
  project: {
    pi: 'PI', literature: 'الأدبيات', proposal: 'المقترح', experiments: 'التجارب',
    manuscript: 'المخطوطة', review: 'المراجعة', rebuttal: 'الرد', presentation: 'العرض التقديمي', references: 'المراجع', config: 'التكوين',
    sendMessage: 'إرسال', enterToSend: 'Enter للإرسال', shiftEnter: 'Shift+Enter لسطر جديد',
    startConversation: 'بدء محادثة', openTerminal: 'فتح الطرفية',
    closeTerminal: 'إغلاق الطرفية', attachFiles: 'إرفاق ملفات',
  },
  common: {
    save: 'حفظ', cancel: 'إلغاء', delete: 'حذف', rename: 'إعادة تسمية', confirm: 'تأكيد',
    loading: 'جارٍ التحميل...', saved: 'تم الحفظ', failed: 'فشل', error: 'خطأ', success: 'نجاح',
  },
}

// ── Registry ────────────────────────────────────────

const translations: Record<Locale, Record<string, string>> = {
  en: flatten(en),
  zh: flatten(zh),
  ja: flatten(ja),
  fr: flatten(fr),
  de: flatten(de),
  ar: flatten(ar),
}

function getStoredLocale(): Locale {
  if (typeof window === 'undefined') return 'en'
  const stored = window.localStorage.getItem(STORAGE_KEY)
  if (stored && stored in translations) return stored as Locale
  const lang = navigator.language.toLowerCase()
  if (lang.startsWith('zh')) return 'zh'
  if (lang.startsWith('ja')) return 'ja'
  if (lang.startsWith('fr')) return 'fr'
  if (lang.startsWith('de')) return 'de'
  if (lang.startsWith('ar')) return 'ar'
  return 'en'
}

let _currentLocale: Locale = getStoredLocale()
const _listeners = new Set<() => void>()

function _setGlobalLocale(locale: Locale) {
  _currentLocale = locale
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(STORAGE_KEY, locale)
    // Set RTL for Arabic
    document.documentElement.dir = locale === 'ar' ? 'rtl' : 'ltr'
  }
  _listeners.forEach((fn) => fn())
}

export function useLocale() {
  const [, forceUpdate] = useState(0)

  useEffect(() => {
    const handler = () => forceUpdate((n) => n + 1)
    _listeners.add(handler)
    return () => { _listeners.delete(handler) }
  }, [])

  const t = useCallback((key: string): string => {
    return translations[_currentLocale]?.[key] || translations.en[key] || key
  }, [])

  return {
    locale: _currentLocale,
    setLocale: _setGlobalLocale,
    t,
    LOCALES,
  }
}
