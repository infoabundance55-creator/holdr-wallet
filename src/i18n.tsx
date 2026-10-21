import { createContext, useContext } from 'react';

export type Lang = 'zh' | 'en';

const zh = {
  // common
  back: '返回', next: '下一步', done: '完成', cancel: '取消', close: '关闭', copy: '复制', copied: '已复制',
  copyAddress: '复制地址', share: '分享', confirm: '确认', retry: '重试',
  showPw: '显示密码', hidePw: '隐藏密码', password: '密码',
  // welcome
  welcomeHeadline: '美股和加密货币，\n一个钱包 hold 住。',
  welcomeSub: '在 Robinhood Chain 上持有股票代币和加密资产。私钥只保存在你的设备上，只有你能动你的资产。',
  createWallet: '建立新钱包', importWallet: '我已有钱包，导入',
  switchLang: 'Switch to English', langBtn: 'EN',
  // backup
  stepOf: '第 {n} 步，共 3 步',
  backupTitle: '抄下你的助记词',
  backupSub: '这 12 个英文单词就是你的钱包。手机丢了、浏览器清空了，只要有它就能找回所有资产。',
  noOneLooking: '确认周围没人在看', revealPhrase: '显示助记词',
  tipWrite: '用纸笔按顺序抄下来，放在安全的地方。',
  tipNoScreenshot: '不要截图、不要存在网盘或发给任何人。',
  tipNeverAsk: 'Holdr 不会保存你的助记词，也永远不会向你索取。',
  savedCheck: '我已经按顺序抄下来了',
  // verify
  verifyTitle: '确认你抄对了', verifySub: '看着你抄下的助记词，选出对应位置的单词。',
  wordN: '第 {n} 个单词', correct: '✓ 正确', wrongWord: '不对，再看看你抄下的第 {n} 个单词。',
  // password
  setPwTitle: '设定解锁密码',
  setPwSub: '每次打开 Holdr 都要输入这个密码。它只保存在这个浏览器里，用来加密你的钱包。',
  ruleLen: '至少 8 个字符', ruleMix: '包含字母和数字', ruleDiff: '和当前密码不同',
  strength: '强度', weak: '弱', medium: '中', strong: '强',
  pwAgain: '再输入一次', pwMismatch: '两次输入的密码不一样。', pwMatch: '✓ 密码一致',
  pwNote: '忘记密码不会丢失资产，用助记词重新导入就能找回。',
  finishCreate: '建立钱包', encrypting: '正在加密…',
  // import
  importTitle: '导入钱包', importSub: '输入 12 或 24 个单词的助记词，或者 0x 开头的私钥。',
  importLabel: '助记词或私钥', importPlaceholder: 'word1 word2 word3 …',
  importBad: '认不出来。助记词要用空格分开；私钥要 64 位十六进制字符。',
  importPrivacy: '你输入的内容只在这台设备上处理，不会上传。',
  // unlock
  welcomeBack: '欢迎回来', unlock: '解锁', unlocking: '解锁中…', wrongPw: '密码不对，请再试一次。',
  forgotPw: '忘记密码？用助记词恢复',
  forgotTitle: '用助记词重新导入？',
  forgotBody: '这会从这个浏览器删除已加密的钱包，然后你可以用助记词重新导入。如果你没有抄下助记词，资产将无法找回。',
  forgotConfirm: '删除并重新导入',
  // assets
  totalAssets: '总资产', hideAmounts: '隐藏金额', showAmounts: '显示金额',
  receive: '收款', send: '转账', history: '记录',
  gameTagline: '每日挑战已开放 · 踩着 K 线冲上月球', gamePlay: '开玩', gameOpen: '打开 Moon Jump 小游戏',
  all: '全部', stocks: '股票代币', crypto: '加密货币',
  navAssets: '资产', navActivity: '活动', navMe: '我的', mainNav: '主导航', quickActions: '快捷操作', assetTabs: '资产分类',
  stocksSoon: '股票代币和美元价格会在下一个版本接上。',
  testnetBadge: '测试网', noFunds: '还没有资产', getTestEth: '领取测试 ETH',
  netError: '连不上区块链节点，请检查网络后重试。', refreshing: '更新中…', updated: '已更新',
  // receive
  myAddress: '我的钱包地址',
  receiveNote: '只接收 {net} 上的资产，包括 ETH、股票代币和稳定币。从其他链转入，资产可能会丢失。',
  // send
  sendTitle: '转账', confirmSend: '确认转账', available: '可用 {amt} {sym}',
  toAddress: '收款地址', toPlaceholder: '0x 开头的地址', paste: '粘贴地址',
  amount: '金额', max: '最大', fee: '网络手续费', feeEstimating: '估算中…', payWithEth: '以 ETH 支付',
  addrBad: '地址格式不对：要以 0x 开头，共 42 个字符。', addrOk: '✓ 地址格式正确', addrHint: '只能转到 {net} 上的地址。',
  addrSelf: '这是你自己的地址。',
  amtBad: '请输入大于 0 的数字。', amtTooMuch: '余额不足：最多可转 {amt} {sym}。',
  review: '检查转账', youSend: '你将发送', network: '网络', total: '合计',
  irreversible: '转账确认后无法撤回。请核对地址的开头和结尾。',
  sending: '发送中…', edit: '返回修改', sent: '已发送',
  sentBody: '{amt} {sym} 正在发送到 {to}，通常几秒内到账。',
  viewExplorer: '在区块浏览器查看 ↗', sendFailed: '发送失败：{msg}',
  // activity
  activityTitle: '交易记录', sentFrom: '转出 {sym}', toShort: '到 {to}',
  activityEmpty: '还没有交易记录',
  activityNote: '目前只显示从这个钱包发出的转账。完整的转入、转出记录会在下一个版本接上。',
  pending: '◷ 处理中', success: '✓ 成功', failed: '✕ 失败',
  // settings
  meTitle: '我的', myWallet: '我的钱包', secWallet: '钱包', backupPhrase: '查看助记词', notBacked: '未备份',
  changePw: '修改密码', secPref: '偏好设置', language: '语言', langName: '简体中文',
  networkLabel: '网络', secSafety: '安全', autoLock: '自动锁定', minutes: '{n} 分钟', lockNow: '立即锁定',
  secAbout: '关于', version: '版本', removeWallet: '从这个浏览器移除钱包',
  removeBody: '移除后需要用助记词重新导入。请先确认你已经抄下助记词。', removeConfirm: '确认移除',
  locked: '已锁定',
  // change password
  curPw: '当前密码', newPw: '新密码', newPwAgain: '确认新密码', savePw: '保存新密码', pwUpdated: '密码已更新',
  changePwNote: '修改密码只影响这个浏览器的解锁方式，你的助记词和钱包地址都不会改变。',
  // reveal
  revealTitle: '查看助记词', revealSub: '输入密码后显示。确认周围没人在看。', revealBtn: '显示',
  privateKeyOnly: '这个钱包是用私钥导入的，没有助记词。以下是你的私钥：',
  markBacked: '我已经抄下来了',
  // network sheet
  netTestnetSub: '用测试币练习，不涉及真钱', netMainnetSub: '真实资产',
  mainnetWarn: '主网上的资产是真钱。第一版钱包尚未经过安全审计，请只放少量资产。',
};

export type Key = keyof typeof zh;

const en: Record<Key, string> = {
  back: 'Back', next: 'Next', done: 'Done', cancel: 'Cancel', close: 'Close', copy: 'Copy', copied: 'Copied',
  copyAddress: 'Copy address', share: 'Share', confirm: 'Confirm', retry: 'Retry',
  showPw: 'Show password', hidePw: 'Hide password', password: 'Password',
  welcomeHeadline: 'Stocks and crypto.\nOne wallet holds it all.',
  welcomeSub: 'Hold tokenized stocks and crypto on Robinhood Chain. Your keys stay on your device, so only you can move your assets.',
  createWallet: 'Create a new wallet', importWallet: 'I already have a wallet',
  switchLang: '切换到中文', langBtn: '中文',
  stepOf: 'Step {n} of 3',
  backupTitle: 'Write down your recovery phrase',
  backupSub: 'These 12 words are your wallet. If you lose your phone or clear your browser, they bring everything back.',
  noOneLooking: 'Make sure no one is watching', revealPhrase: 'Show phrase',
  tipWrite: 'Write them down in order on paper and keep it somewhere safe.',
  tipNoScreenshot: 'Never screenshot them, store them online, or send them to anyone.',
  tipNeverAsk: 'Holdr never stores your phrase and will never ask for it.',
  savedCheck: 'I wrote them down in order',
  verifyTitle: 'Check you got it right', verifySub: 'Look at your written phrase and pick the word in each position.',
  wordN: 'Word #{n}', correct: '✓ Correct', wrongWord: 'Not quite. Check word #{n} on your paper.',
  setPwTitle: 'Set an unlock password',
  setPwSub: 'You will enter this each time you open Holdr. It stays in this browser and encrypts your wallet.',
  ruleLen: 'At least 8 characters', ruleMix: 'Letters and numbers', ruleDiff: 'Different from current password',
  strength: 'Strength', weak: 'Weak', medium: 'Medium', strong: 'Strong',
  pwAgain: 'Enter it again', pwMismatch: 'The passwords do not match.', pwMatch: '✓ Passwords match',
  pwNote: 'Forgetting this password will not lose your assets. Re-import with your recovery phrase.',
  finishCreate: 'Create wallet', encrypting: 'Encrypting…',
  importTitle: 'Import a wallet', importSub: 'Enter a 12 or 24 word recovery phrase, or a private key starting with 0x.',
  importLabel: 'Recovery phrase or private key', importPlaceholder: 'word1 word2 word3 …',
  importBad: 'We could not read that. Separate phrase words with spaces; a private key has 64 hex characters.',
  importPrivacy: 'What you enter is processed on this device only and never uploaded.',
  welcomeBack: 'Welcome back', unlock: 'Unlock', unlocking: 'Unlocking…', wrongPw: 'Wrong password. Try again.',
  forgotPw: 'Forgot password? Restore with phrase',
  forgotTitle: 'Re-import with your phrase?',
  forgotBody: 'This removes the encrypted wallet from this browser so you can import it again. Without your recovery phrase, your assets cannot be recovered.',
  forgotConfirm: 'Remove and re-import',
  totalAssets: 'Total balance', hideAmounts: 'Hide amounts', showAmounts: 'Show amounts',
  receive: 'Receive', send: 'Send', history: 'History',
  gameTagline: 'Daily challenge is live. Jump the candles to the moon.', gamePlay: 'PLAY', gameOpen: 'Open the Moon Jump game',
  all: 'All', stocks: 'Stocks', crypto: 'Crypto',
  navAssets: 'Assets', navActivity: 'Activity', navMe: 'Me', mainNav: 'Main navigation', quickActions: 'Quick actions', assetTabs: 'Asset types',
  stocksSoon: 'Stock tokens and USD prices arrive in the next version.',
  testnetBadge: 'Testnet', noFunds: 'No assets yet', getTestEth: 'Get test ETH',
  netError: 'Could not reach the network. Check your connection and retry.', refreshing: 'Updating…', updated: 'Updated',
  myAddress: 'My wallet address',
  receiveNote: 'Only send assets on {net} here, including ETH, stock tokens and stablecoins. Assets sent from other chains may be lost.',
  sendTitle: 'Send', confirmSend: 'Confirm send', available: 'Available {amt} {sym}',
  toAddress: 'To address', toPlaceholder: 'Address starting with 0x', paste: 'Paste address',
  amount: 'Amount', max: 'Max', fee: 'Network fee', feeEstimating: 'Estimating…', payWithEth: 'paid in ETH',
  addrBad: 'Invalid address: it should start with 0x and be 42 characters.', addrOk: '✓ Address looks right', addrHint: 'Only addresses on {net}.',
  addrSelf: 'This is your own address.',
  amtBad: 'Enter a number greater than 0.', amtTooMuch: 'Not enough balance: you can send up to {amt} {sym}.',
  review: 'Review', youSend: 'You are sending', network: 'Network', total: 'Total',
  irreversible: 'Transfers cannot be undone. Check the start and end of the address.',
  sending: 'Sending…', edit: 'Edit', sent: 'Sent',
  sentBody: '{amt} {sym} is on its way to {to}. It usually arrives within seconds.',
  viewExplorer: 'View on explorer ↗', sendFailed: 'Send failed: {msg}',
  activityTitle: 'Activity', sentFrom: 'Sent {sym}', toShort: 'To {to}',
  activityEmpty: 'No transactions yet',
  activityNote: 'For now this shows transfers sent from this wallet. Full history arrives in the next version.',
  pending: '◷ Pending', success: '✓ Success', failed: '✕ Failed',
  meTitle: 'Me', myWallet: 'My wallet', secWallet: 'Wallet', backupPhrase: 'View recovery phrase', notBacked: 'Not backed up',
  changePw: 'Change password', secPref: 'Preferences', language: 'Language', langName: 'English',
  networkLabel: 'Network', secSafety: 'Security', autoLock: 'Auto-lock', minutes: '{n} min', lockNow: 'Lock now',
  secAbout: 'About', version: 'Version', removeWallet: 'Remove wallet from this browser',
  removeBody: 'You will need your recovery phrase to import it again. Make sure you have it written down.', removeConfirm: 'Remove',
  locked: 'Locked',
  curPw: 'Current password', newPw: 'New password', newPwAgain: 'Confirm new password', savePw: 'Save new password', pwUpdated: 'Password updated',
  changePwNote: 'This only changes how you unlock in this browser. Your recovery phrase and address stay the same.',
  revealTitle: 'Recovery phrase', revealSub: 'Enter your password to show it. Make sure no one is watching.', revealBtn: 'Show',
  privateKeyOnly: 'This wallet was imported with a private key and has no phrase. Your private key:',
  markBacked: 'I have written it down',
  netTestnetSub: 'Practice with test coins, no real money', netMainnetSub: 'Real assets',
  mainnetWarn: 'Mainnet assets are real money. This first version has not been security audited, so keep only small amounts.',
};

export const DICTS: Record<Lang, Record<Key, string>> = { zh, en };

export function detectLang(): Lang {
  const l = (typeof navigator !== 'undefined' && navigator.language) || 'en';
  return l.toLowerCase().startsWith('zh') ? 'zh' : 'en';
}

export function translate(lang: Lang, key: Key, vars?: Record<string, string | number>): string {
  let s = DICTS[lang][key] ?? key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v));
  return s;
}

export const LangContext = createContext<{ lang: Lang; setLang: (l: Lang) => void }>({ lang: 'zh', setLang: () => {} });

export function useT() {
  const { lang } = useContext(LangContext);
  return (key: Key, vars?: Record<string, string | number>) => translate(lang, key, vars);
}
