
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality, Type, FunctionDeclaration, Tool } from '@google/genai';
import { GoogleLogin } from '@react-oauth/google';
import { jwtDecode } from 'jwt-decode';
import { decode, encode, decodeAudioData, playUISound, blobToBase64 } from './utils/audioHelpers';
import CameraView from './components/CameraView';
import { SessionStatus, Transcription, Product, CartItem, Invoice, StockLog, Customer, PreOrder, UserProfile, PricingPlan } from './types';
import { loadStoreData, saveStoreData, checkPaymentStatus, createPaymentOrder, isApiConfigured, registerDevice, checkSession, getOrCreateDeviceId, registerUserOnServer } from './utils/api';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

interface DebugLog {
  id: string;
  timestamp: string;
  message: string;
  type: 'info' | 'api' | 'error' | 'warning';
}

interface UIAudioSettings {
  enabled: boolean;
  profile: 'default' | 'crystal' | 'electronic';
  volume: number;
}

// --- CONSTANTS & CONFIG ---
const TRIAL_DAYS = 14;
const DAILY_LIMIT_MINUTES = 30;
const ZALO_PHONE = '0986234983'; // Quét QR Zalo tư vấn sử dụng
const ZALO_QR_URL = `https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent('https://zalo.me/' + ZALO_PHONE)}`;
const PRICING_PLANS: PricingPlan[] = [
  { id: '1m', name: 'Gói 1 Tháng', durationMonths: 1, price: 250000, description: 'Trải nghiệm đầy đủ tính năng.' },
  { id: '3m', name: 'Gói 3 Tháng', durationMonths: 3, price: 700000, originalPrice: 750000, description: 'Tiết kiệm 50.000đ.' },
  { id: '6m', name: 'Gói 6 Tháng', durationMonths: 6, price: 1350000, originalPrice: 1500000, description: 'Tiết kiệm 150.000đ.' },
  { id: '1y', name: 'Gói 1 Năm', durationMonths: 12, price: 2500000, originalPrice: 3000000, description: 'Tiết kiệm 500.000đ. Ưu đãi nhất!' },
];

// --- SEPAY CONFIG (MOCK BANK INFO FOR QR GENERATION) ---
const SEPAY_BANK_ACC = "0986234983"; 
const SEPAY_BANK_NAME = "MBBank"; 
const SEPAY_TEMPLATE = "compact";

// --- LANGUAGE DICTIONARY ---
const TRANSLATIONS = {
  vi: {
    roleStaff: 'QUẢN LÝ',
    roleCustomer: 'KHÁCH HÀNG',
    statusIdle: 'Sẵn sàng',
    statusListening: 'Đang nghe...',
    statusSpeaking: 'AI đang nói...',
    statusConnecting: 'ĐANG KẾT NỐI...',
    statusReconnecting: 'MẤT MẠNG - ĐANG NỐI LẠI...',
    statusOffline: 'KHÔNG CÓ INTERNET',
    statusStop: 'DỪNG PHIÊN',
    statusStart: 'BẮT ĐẦU',
    tabChat: 'CHAT',
    tabPos: 'POS',
    tabCrm: 'CRM',
    tabLogs: 'LOGS',
    tabSettings: 'CẤU HÌNH',
    invoiceTitle: 'HÓA ĐƠN BÁN HÀNG',
    invoiceTitleA4: 'HÓA ĐƠN BÁN LẺ',
    customer: 'Khách hàng',
    phone: 'SĐT',
    addressLabel: 'Địa chỉ',
    date: 'Ngày',
    cashier: 'Thu ngân',
    slipNo: 'Số phiếu',
    time: 'In lúc',
    item: 'Tên sản phẩm',
    qty: 'SL',
    unit: 'ĐVT',
    price: 'Đơn giá',
    amount: 'Thành tiền',
    subtotal: 'Cộng tiền hàng',
    tax: 'Thuế GTGT (0%)',
    total: 'Tổng thanh toán',
    thankYou: 'Xin cảm ơn Quý khách / Thank you!',
    seeYou: 'Hẹn gặp lại!',
    printPdf: '🖨 TẢI & IN HÓA ĐƠN',
    remoteMicOn: '🎤 MIC TỪ XA: BẬT',
    standbyMode: 'CHẾ ĐỘ CHỜ',
    camVision: 'CAMERA VISION',
    pirSensor: 'CẢM BIẾN PIR',
    storeName: 'TÊN CỬA HÀNG',
    website: 'WEBSITE',
    hotline: 'HOTLINE',
    address: 'ĐỊA CHỈ',
    save: 'LƯU',
    backup: 'SAO LƯU (.JSON)',
    restore: 'KHÔI PHỤC',
    historyChat: 'Lịch sử trò chuyện',
    clear: 'XÓA',
    home: 'HOME',
    systemLog: 'NHẬT KÝ HỆ THỐNG',
    promotionContent: 'CHƯƠNG TRÌNH KHUYẾN MÃI & NỘI DUNG',
    productList: 'DANH SÁCH SẢN PHẨM',
    importFile: '📎 TẢI TÀI LIỆU',
    uploadCatalog: '⬆ Tải file hàng',
    pay: 'Thanh toán',
    addToCart: '+ Thêm',
    importStock: '+ Nhập',
    searchCrm: 'Tìm kiếm khách (Tên/SĐT)...',
    orderList: 'ĐƠN ĐẶT HÀNG',
    customerList: 'DANH SÁCH KHÁCH HÀNG',
    wait: 'chờ',
    buyerSig: 'Người mua hàng',
    sellerSig: 'Người bán hàng',
    sigNote: '(Ký, ghi rõ họ tên)',
    checkoutTitle: 'THÔNG TIN THANH TOÁN',
    requiredInfo: 'Vui lòng nhập thông tin để bảo hành',
    confirmPay: 'XÁC NHẬN & IN HÓA ĐƠN',
    cancel: 'Hủy bỏ',
    systemPrompt: `(Hệ thống: Khách vừa bước vào. Hãy chào to bằng ngôn ngữ phù hợp (Việt/Anh): "Xin chào! Chào mừng đến với [Store Name]!" sau đó hỏi khách cần hỗ trợ gì.)`,
    // Auth & Payment
    loginTitle: 'Đăng nhập để sử dụng',
    loginDesc: 'Sử dụng tài khoản Google để trải nghiệm Bảo Minh AI.',
    btnLoginGoogle: 'Tiếp tục với Google',
    trialBanner: 'Dùng thử: Còn {days} ngày. Hôm nay còn: {minutes} phút.',
    premiumBanner: 'PREMIUM: {start} ➔ {end}',
    upgradeTitle: 'Nâng cấp lên Premium',
    upgradeDesc: 'Hết thời gian dùng thử hoặc giới hạn ngày. Vui lòng chọn gói cước để tiếp tục.',
    bankTransfer: 'Chuyển khoản QR SePay',
    scanQr: 'Quét mã để thanh toán',
    iHavePaid: 'Tôi đã thanh toán',
    checkingPayment: 'Đang kiểm tra...',
    paymentSuccess: 'Thanh toán thành công! Cảm ơn bạn.',
    paymentSuccessDetail: 'Gói cước đã kích hoạt.\nHiệu lực: {start} đến {end}',
    limitReached: 'Đã hết thời gian dùng thử hôm nay (30p).',
    trialExpired: 'Gói dùng thử 14 ngày đã hết hạn.',
    // Settings
    apiConfig: 'CẤU HÌNH API',
    enterApiKey: 'Nhập Gemini API Key...',
    add: 'THÊM',
    remove: 'XÓA',
    storeProfile: 'HỒ SƠ CỬA HÀNG',
    storeNamePlaceholder: 'Tên cửa hàng',
    hotlinePlaceholder: 'Hotline',
    websitePlaceholder: 'Website',
    addressPlaceholder: 'Địa chỉ',
    promotionPlaceholder: 'Thông tin khuyến mãi / Chính sách...',
    hardwareConnection: 'PHẦN CỨNG & KẾT NỐI',
    esp32IpPlaceholder: 'Địa chỉ IP Camera ESP32 (vd: 192.168.1.5)',
    test: 'KIỂM TRA',
    remoteMic: 'Mic từ xa (ESP32)',
    pirSensorMode: 'Chế độ cảm biến PIR',
    voiceOnly: 'Chỉ dùng giọng nói (Không Camera)',
    systemData: 'DỮ LIỆU HỆ THỐNG',
    backupData: 'Sao lưu dữ liệu (.json)',
    restoreData: 'Khôi phục dữ liệu',
    // Missing Translations
    cartTitle: 'GIỎ HÀNG',
    clearCart: 'XÓA HẾT',
    items: 'món',
    confirmClearHistory: 'Bạn có chắc muốn xóa toàn bộ lịch sử trò chuyện không?',
    validationError: 'Vui lòng nhập đầy đủ thông tin.',
    subscription: 'ĐĂNG KÝ GÓI CƯỚC',
    extendPlan: 'Gia hạn / Nâng cấp',
    planFree: 'Dùng thử',
    planPremium: 'Premium',
    back: 'Quay lại',
    crmTitle: 'QUẢN LÝ KHÁCH HÀNG (CRM)',
    zaloConsult: 'Tư vấn Zalo',
    zaloConsultDesc: 'Quét QR để nhắn tin tư vấn sử dụng',
    logs: {
        connected: 'Đã kết nối',
        disconnected: 'Đã ngắt kết nối',
        cameraError: 'Lỗi Camera',
        micConnected: 'Mic từ xa đã kết nối',
        motionDetected: 'Phát hiện chuyển động',
        initializing: 'Đang khởi tạo AI...',
        restoring: 'Đang khôi phục ngữ cảnh...',
        backupSuccess: 'Sao lưu thành công.',
        restoreSuccess: 'Khôi phục thành công!',
        restoreFail: 'File lỗi.',
        fileProcessed: 'Đã xử lý file.',
        fileSent: 'Đã gửi file cho AI.',
        errorSending: 'Lỗi gửi file.',
        socketError: 'Lỗi Socket',
        sensorFail: 'Lỗi kết nối cảm biến',
        timeout: 'Quá thời gian',
        cameraConnected: 'Camera đã kết nối!',
        scanned: 'Đã quét: ',
        imported: 'Đã nhập (+1): ',
        check: 'Kiểm tra: ',
        unknownCode: 'Mã lạ: ',
        outOfStock: 'Hết hàng: ',
        updatedItems: 'Đã cập nhật số lượng món: ',
        toolCalled: 'Gọi công cụ: ',
        toolResult: 'Kết quả: '
    }
  },
  en: {
    roleStaff: 'MANAGER',
    roleCustomer: 'CUSTOMER',
    statusIdle: 'Ready',
    statusListening: 'Listening...',
    statusSpeaking: 'AI Speaking...',
    statusConnecting: 'CONNECTING...',
    statusReconnecting: 'RECONNECTING...',
    statusOffline: 'NO INTERNET',
    statusStop: 'STOP SESSION',
    statusStart: 'START',
    tabChat: 'CHAT',
    tabPos: 'POS',
    tabCrm: 'CRM',
    tabLogs: 'LOGS',
    tabSettings: 'SETTINGS',
    invoiceTitle: 'RECEIPT',
    invoiceTitleA4: 'RETAIL INVOICE',
    customer: 'Customer',
    phone: 'Phone',
    addressLabel: 'Address',
    date: 'Date',
    cashier: 'Cashier',
    slipNo: 'Slip No',
    time: 'Time',
    item: 'Description',
    qty: 'Qty',
    unit: 'Unit',
    price: 'Unit Price',
    amount: 'Amount',
    subtotal: 'Subtotal',
    tax: 'VAT (0%)',
    total: 'Grand Total',
    thankYou: 'Thank you for shopping!',
    seeYou: 'See you again!',
    printPdf: '🖨 DOWNLOAD & PRINT',
    remoteMicOn: '🎤 REMOTE MIC: ON',
    standbyMode: 'STANDBY MODE',
    camVision: 'CAMERA VISION',
    pirSensor: 'PIR SENSOR',
    storeName: 'STORE NAME',
    website: 'WEBSITE',
    hotline: 'HOTLINE',
    address: 'ADDRESS',
    save: 'SAVE',
    backup: 'BACKUP (.JSON)',
    restore: 'RESTORE',
    historyChat: 'Chat History',
    clear: 'CLEAR',
    home: 'HOME',
    systemLog: 'SYSTEM LOGS',
    promotionContent: 'PROMOTIONS & CONTENT',
    productList: 'PRODUCT LIST',
    importFile: '📎 UPLOAD DOCS',
    uploadCatalog: '⬆ Upload Catalog',
    pay: 'Checkout',
    addToCart: '+ Add',
    importStock: '+ Import',
    searchCrm: 'Search customer (Name/Phone)...',
    orderList: 'PRE-ORDERS',
    customerList: 'CUSTOMER LIST',
    wait: 'pending',
    buyerSig: 'Buyer',
    sellerSig: 'Seller',
    sigNote: '(Sign & Full Name)',
    checkoutTitle: 'CHECKOUT INFO',
    requiredInfo: 'Please enter info for warranty',
    confirmPay: 'CONFIRM & PRINT',
    cancel: 'Cancel',
    systemPrompt: `(System: Customer just entered. Greet them loudly in English or Vietnamese depending on their appearance/language: "Hello! Welcome to [Store Name]!" then ask how to help.)`,
    loginTitle: 'Login Required',
    loginDesc: 'Use Google account to access Bao Minh AI.',
    btnLoginGoogle: 'Continue with Google',
    trialBanner: 'Trial: {days} days left. Today: {minutes} mins left.',
    premiumBanner: 'PREMIUM: {start} ➔ {end}',
    upgradeTitle: 'Upgrade to Premium',
    upgradeDesc: 'Trial expired or daily limit reached. Please verify subscription.',
    bankTransfer: 'SePay QR Transfer',
    scanQr: 'Scan QR to Pay',
    iHavePaid: 'I have paid',
    checkingPayment: 'Checking...',
    paymentSuccess: 'Payment successful! Thank you.',
    paymentSuccessDetail: 'Plan activated.\nValid: {start} to {end}',
    limitReached: 'Daily limit reached (30m).',
    trialExpired: '14-day trial expired.',
    apiConfig: 'API CONFIGURATION',
    enterApiKey: 'Enter Gemini API Key...',
    add: 'ADD',
    remove: 'REMOVE',
    storeProfile: 'STORE PROFILE',
    storeNamePlaceholder: 'Store Name',
    hotlinePlaceholder: 'Hotline',
    websitePlaceholder: 'Website',
    addressPlaceholder: 'Address',
    promotionPlaceholder: 'Promotions / Policies...',
    hardwareConnection: 'HARDWARE & CONNECTION',
    esp32IpPlaceholder: 'ESP32 IP Camera Address (e.g. 192.168.1.5)',
    test: 'TEST',
    remoteMic: 'Remote Mic (ESP32)',
    pirSensorMode: 'PIR Sensor Mode',
    voiceOnly: 'Voice Only (No Camera)',
    systemData: 'SYSTEM DATA',
    backupData: 'Backup Data (.json)',
    restoreData: 'Restore Data',
    cartTitle: 'CART',
    clearCart: 'CLEAR ALL',
    items: 'items',
    confirmClearHistory: 'Are you sure you want to clear chat history?',
    validationError: 'Please fill in all required fields.',
    subscription: 'SUBSCRIPTION',
    extendPlan: 'Extend / Upgrade',
    planFree: 'Trial',
    planPremium: 'Premium',
    back: 'Back',
    crmTitle: 'CUSTOMER MANAGEMENT (CRM)',
    zaloConsult: 'Zalo support',
    zaloConsultDesc: 'Scan QR to chat for usage support',
    logs: {
        connected: 'Connected',
        disconnected: 'Disconnected',
        cameraError: 'Camera Error',
        micConnected: 'Remote Mic Connected',
        motionDetected: 'Motion Detected',
        initializing: 'Initializing AI...',
        restoring: 'Restoring context...',
        backupSuccess: 'Backup successful.',
        restoreSuccess: 'Restore successful!',
        restoreFail: 'Invalid backup file.',
        fileProcessed: 'File processed.',
        fileSent: 'File sent to AI.',
        errorSending: 'Error sending file.',
        socketError: 'Socket Error',
        sensorFail: 'Sensor Connection Failed',
        timeout: 'Timeout',
        cameraConnected: 'Camera Connected!',
        scanned: 'Scanned: ',
        imported: 'Imported (+1): ',
        check: 'Check: ',
        unknownCode: 'Unknown code: ',
        outOfStock: 'Out of stock: ',
        updatedItems: 'Updated items: ',
        toolCalled: 'Tool Called: ',
        toolResult: 'Result: '
    }
  },
  zh: {
    roleStaff: '经理', roleCustomer: '顾客', statusIdle: '就绪', statusListening: '正在聆听...', statusSpeaking: 'AI 正在说话...', statusConnecting: '正在连接...', statusReconnecting: '重新连接...', statusOffline: '离线', statusStop: '停止会话', statusStart: '开始', tabChat: '聊天', tabPos: '收银', tabCrm: '客户', tabLogs: '日志', tabSettings: '设置', invoiceTitle: '销售收据', invoiceTitleA4: '零售发票', customer: '顾客', phone: '电话', addressLabel: '地址', date: '日期', cashier: '收银员', slipNo: '单号', time: '时间', item: '商品名称', qty: '数量', unit: '单位', price: '单价', amount: '金额', subtotal: '小计', tax: '增值税 (0%)', total: '总计', thankYou: '谢谢惠顾！', seeYou: '欢迎下次光临！', printPdf: '🖨 打印发票', remoteMicOn: '🎤 远程麦克风：开启', standbyMode: '待机模式', camVision: '摄像头视觉', pirSensor: 'PIR 传感器', storeName: '商店名称', website: '网站', hotline: '热线', address: '地址', save: '保存', backup: '备份 (.JSON)', restore: '恢复', historyChat: '聊天记录', clear: '清除', home: '主页', systemLog: '系统日志', promotionContent: '促销活动 & 内容', productList: '产品列表', importFile: '📎 上传文档', uploadCatalog: '⬆ 上传目录', pay: '结账', addToCart: '+ 添加', importStock: '+ 入库', searchCrm: '搜索客户 (姓名/电话)...', orderList: '预订订单', customerList: '客户列表', wait: '等待', buyerSig: '买方', sellerSig: '卖方', sigNote: '(签字及全名)', checkoutTitle: '结账信息', requiredInfo: '请输入保修信息', confirmPay: '确认并打印', cancel: '取消', systemPrompt: `(系统：顾客刚进门。请根据他们的外貌/语言大声用中文、英文或越南语打招呼：“你好！欢迎光临 [Store Name]！”然后询问有什么可以帮到他们。)`,
    loginTitle: '需要登录', loginDesc: '使用 Google 帐户访问。', btnLoginGoogle: '继续使用 Google', trialBanner: '试用期：剩 {days} 天。今日剩余：{minutes} 分钟。', premiumBanner: '高级版：{start} ➔ {end}', upgradeTitle: '升级到高级版', upgradeDesc: '试用期已过或达到每日限制。请选择套餐。', bankTransfer: 'SePay 二维码转账', scanQr: '扫码支付', iHavePaid: '我已付款', checkingPayment: '正在检查...', paymentSuccess: '支付成功！谢谢。', paymentSuccessDetail: '套餐已激活。\n有效期：{start} 至 {end}', limitReached: '今日试用时间已达上限 (30分钟)。', trialExpired: '14天试用期已结束。',
    apiConfig: 'API 配置', enterApiKey: '输入 Gemini API Key...', add: '添加', remove: '移除', storeProfile: '商店资料', storeNamePlaceholder: '商店名称', hotlinePlaceholder: '热线', websitePlaceholder: '网站', addressPlaceholder: '地址', promotionPlaceholder: '促销信息 / 政策...', hardwareConnection: '硬件与连接', esp32IpPlaceholder: 'ESP32 摄像头 IP 地址 (例如 192.168.1.5)', test: '测试', remoteMic: '远程麦克风 (ESP32)', pirSensorMode: 'PIR 传感器模式', voiceOnly: '仅语音 (无摄像头)', systemData: '系统数据', backupData: '备份数据 (.json)', restoreData: '恢复数据', cartTitle: '购物车', clearCart: '清空', items: '件', confirmClearHistory: '您确定要清除聊天记录吗？', validationError: '请填写所有必填字段。', subscription: '订阅', extendPlan: '续费 / 升级', planFree: '试用', planPremium: '高级版', back: '返回', crmTitle: '客户关系管理 (CRM)', zaloConsult: 'Zalo 咨询', zaloConsultDesc: '扫码咨询使用',
    logs: {
        connected: '已连接', disconnected: '已断开', cameraError: '摄像头错误', micConnected: '远程麦克风已连接', motionDetected: '检测到运动',
        initializing: '正在初始化 AI...', restoring: '正在恢复上下文...', backupSuccess: '备份成功。', restoreSuccess: '恢复成功！', restoreFail: '备份文件无效。', fileProcessed: '文件已处理。', fileSent: '文件已发送给 AI。', errorSending: '发送文件错误。', socketError: 'Socket 错误', sensorFail: '传感器连接失败', timeout: '超时', cameraConnected: '摄像头已连接！',
        scanned: '已扫描：', imported: '已入库 (+1)：', check: '检查：', unknownCode: '未知代码：', outOfStock: '缺货：', updatedItems: '已更新项目数：', toolCalled: '调用工具：', toolResult: '结果：'
    }
  },
  ja: {
    roleStaff: 'マネージャー', roleCustomer: 'お客様', statusIdle: '準備完了', statusListening: '聞いています...', statusSpeaking: 'AIが話しています...', statusConnecting: '接続中...', statusReconnecting: '再接続中...', statusOffline: 'オフライン', statusStop: '停止', statusStart: '開始', tabChat: 'チャット', tabPos: 'POS', tabCrm: '顧客', tabLogs: 'ログ', tabSettings: '設定', invoiceTitle: '領収書', invoiceTitleA4: '小売請求書', customer: 'お客様', phone: '電話番号', addressLabel: '住所', date: '日付', cashier: '担当者', slipNo: '伝票番号', time: '時間', item: '商品名', qty: '数量', unit: '単位', price: '単価', amount: '金額', subtotal: '小計', tax: '消費税 (0%)', total: '合計', thankYou: 'ご利用ありがとうございます！', seeYou: 'またのご来店をお待ちしております！', printPdf: '🖨 請求書を印刷', remoteMicOn: '🎤 リモートマイク：オン', standbyMode: 'スタンバイモード', camVision: 'カメラビジョン', pirSensor: 'PIRセンサー', storeName: '店舗名', website: 'ウェブサイト', hotline: 'ホットライン', address: '住所', save: '保存', backup: 'バックアップ (.JSON)', restore: '復元', historyChat: 'チャット履歴', clear: 'クリア', home: 'ホーム', systemLog: 'システムログ', promotionContent: 'プロモーション & コンテンツ', productList: '商品一覧', importFile: '📎 ドキュメント', uploadCatalog: '⬆ カタログ', pay: '会計', addToCart: '+ 追加', importStock: '+ 入庫', searchCrm: '顧客検索 (名前/電話)...', orderList: '予約注文', customerList: '顧客リスト', wait: '待機中', buyerSig: '購入者', sellerSig: '販売者', sigNote: '(署名と氏名)', checkoutTitle: 'チェックアウト情報', requiredInfo: '保証のために情報を入力してください', confirmPay: '確認して印刷', cancel: 'キャンセル', systemPrompt: `(システム：お客様が入店しました。外見や言語に応じて、日本語、英語、またはベトナム語で明るく挨拶してください：「いらっしゃいませ！ [Store Name] へようこそ！」その後、ご用件をお伺いしてください。)`,
    loginTitle: 'ログインが必要です', loginDesc: 'Googleアカウントを使用してアクセスしてください。', btnLoginGoogle: 'Googleで続行', trialBanner: '試用期間: 残り {days} 日。 本日残り: {minutes} 分。', premiumBanner: 'プレミアム: {start} ➔ {end}', upgradeTitle: 'プレミアムにアップグレード', upgradeDesc: '試用期間が終了したか、1日の制限に達しました。プランを選択してください。', bankTransfer: 'SePay QR送金', scanQr: 'QRコードをスキャンして支払う', iHavePaid: '支払いました', checkingPayment: '確認中...', paymentSuccess: '支払いが完了しました！ありがとうございます。', paymentSuccessDetail: 'プランが有効化されました。\n有効期間: {start} から {end}', limitReached: '本日の試用制限（30分）に達しました。', trialExpired: '14日間の試用期間が終了しました。',
    apiConfig: 'API設定', enterApiKey: 'Gemini APIキーを入力...', add: '追加', remove: '削除', storeProfile: '店舗プロフィール', storeNamePlaceholder: '店舗名', hotlinePlaceholder: 'ホットライン', websitePlaceholder: 'ウェブサイト', addressPlaceholder: '住所', promotionPlaceholder: 'プロモーション / ポリシー...', hardwareConnection: 'ハードウェアと接続', esp32IpPlaceholder: 'ESP32 IPカメラアドレス (例: 192.168.1.5)', test: 'テスト', remoteMic: 'リモートマイク (ESP32)', pirSensorMode: 'PIRセンサーモード', voiceOnly: '音声のみ (カメラなし)', systemData: 'システムデータ', backupData: 'データをバックアップ (.json)', restoreData: 'データを復元', cartTitle: 'カート', clearCart: 'すべて削除', items: '点', confirmClearHistory: 'チャット履歴を消去してもよろしいですか？', validationError: 'すべての必須項目を入力してください。', subscription: 'サブスクリプション', extendPlan: '延長 / アップグレード', planFree: 'トライアル', planPremium: 'プレミアム', back: '戻る', crmTitle: '顧客管理 (CRM)', zaloConsult: 'Zaloサポート', zaloConsultDesc: 'QRでスキャンして相談',
    logs: {
        connected: '接続済み', disconnected: '切断されました', cameraError: 'カメラエラー', micConnected: 'リモートマイク接続済み', motionDetected: '動きを検知',
        initializing: 'AIを初期化中...', restoring: 'コンテキストを復元中...', backupSuccess: 'バックアップ成功。', restoreSuccess: '復元成功！', restoreFail: 'バックアップファイルが無効です。', fileProcessed: 'ファイル処理完了。', fileSent: 'ファイルをAIに送信しました。', errorSending: 'ファイル送信エラー。', socketError: 'ソケットエラー', sensorFail: 'センサー接続失敗', timeout: 'タイムアウト', cameraConnected: 'カメラ接続完了！',
        scanned: 'スキャン済み: ', imported: '入庫済み (+1): ', check: '確認: ', unknownCode: '不明なコード: ', outOfStock: '在庫切れ: ', updatedItems: '更新されたアイテム数: ', toolCalled: 'ツール呼び出し: ', toolResult: '結果: '
    }
  },
  ko: {
    roleStaff: '관리자', roleCustomer: '고객', statusIdle: '준비', statusListening: '듣고 있습니다...', statusSpeaking: 'AI가 말하는 중...', statusConnecting: '연결 중...', statusReconnecting: '재연결 중...', statusOffline: '오프라인', statusStop: '중지', statusStart: '시작', tabChat: '채팅', tabPos: 'POS', tabCrm: '고객', tabLogs: '로그', tabSettings: '설정', invoiceTitle: '영수증', invoiceTitleA4: '소매 영수증', customer: '고객', phone: '전화번호', addressLabel: '주소', date: '날짜', cashier: '계산원', slipNo: '전표 번호', time: '시간', item: '상품명', qty: '수량', unit: '단위', price: '단가', amount: '금액', subtotal: '소계', tax: '부가세 (0%)', total: '총계', thankYou: '감사합니다!', seeYou: '또 뵙겠습니다!', printPdf: '🖨 청구서 인쇄', remoteMicOn: '🎤 원격 마이크: 켜짐', standbyMode: '대기 모드', camVision: '카메라 비전', pirSensor: 'PIR 센서', storeName: '상점 이름', website: '웹사이트', hotline: '핫라인', address: '주소', save: '저장', backup: '백업 (.JSON)', restore: '복원', historyChat: '채팅 기록', clear: '지우기', home: '홈', systemLog: '시스템 로그', promotionContent: '프로모션 & 콘텐츠', productList: '제품 목록', importFile: '📎 문서 업로드', uploadCatalog: '⬆ 카탈로그', pay: '결제', addToCart: '+ 추가', importStock: '+ 입고', searchCrm: '고객 검색 (이름/전화)...', orderList: '선주문', customerList: '고객 목록', wait: '대기', buyerSig: '구매자', sellerSig: '판매자', sigNote: '(서명 및 성명)', checkoutTitle: '결제 정보', requiredInfo: '보증을 위해 정보를 입력하십시오', confirmPay: '확인 및 인쇄', cancel: '취소', systemPrompt: `(시스템: 손님이 막 들어왔습니다. 외모/언어에 따라 한국어, 영어 또는 베트남어로 밝게 인사하십시오: "안녕하세요! [Store Name] 에 오신 것을 환영합니다!" 그 후 무엇을 도와드릴지 물어보십시오.)`,
    loginTitle: '로그인 필요', loginDesc: 'Google 계정을 사용하여 액세스하십시오.', btnLoginGoogle: 'Google로 계속', trialBanner: '체험판: {days}일 남음. 오늘 남은 시간: {minutes}분.', premiumBanner: '프리미엄: {start} ➔ {end}', upgradeTitle: '프리미엄으로 업그레이드', upgradeDesc: '체험 기간이 만료되었거나 일일 한도에 도달했습니다. 요금제를 선택하십시오.', bankTransfer: 'SePay QR 이체', scanQr: 'QR 스캔하여 결제', iHavePaid: '결제했습니다', checkingPayment: '확인 중...', paymentSuccess: '결제가 완료되었습니다! 감사합니다.', paymentSuccessDetail: '요금제가 활성화되었습니다.\n유효 기간: {start} ~ {end}', limitReached: '일일 한도(30분)에 도달했습니다.', trialExpired: '14일 체험 기간이 만료되었습니다.',
    apiConfig: 'API 구성', enterApiKey: 'Gemini API 키 입력...', add: '추가', remove: '제거', storeProfile: '상점 프로필', storeNamePlaceholder: '상점 이름', hotlinePlaceholder: '핫라인', websitePlaceholder: '웹사이트', addressPlaceholder: '주소', promotionPlaceholder: '프로모션 / 정책...', hardwareConnection: '하드웨어 및 연결', esp32IpPlaceholder: 'ESP32 IP 카메라 주소 (예: 192.168.1.5)', test: '테스트', remoteMic: '원격 마이크 (ESP32)', pirSensorMode: 'PIR 센서 모드', voiceOnly: '음성 전용 (카메라 없음)', systemData: '시스템 데이터', backupData: '데이터 백업 (.json)', restoreData: '데이터 복원', cartTitle: '장바구니', clearCart: '모두 지우기', items: '아이템', confirmClearHistory: '채팅 기록을 지우시겠습니까?', validationError: '모든 필수 입력란을 채워주세요.', subscription: '구독', extendPlan: '연장 / 업그레이드', planFree: '무료 체험', planPremium: '프리미엄', back: '뒤로', crmTitle: '고객 관리 (CRM)', zaloConsult: 'Zalo 지원', zaloConsultDesc: 'QR 스캔하여 문의',
    logs: {
        connected: '연결됨', disconnected: '연결 끊김', cameraError: '카메라 오류', micConnected: '원격 마이크 연결됨', motionDetected: '동작 감지됨',
        initializing: 'AI 초기화 중...', restoring: '컨텍스트 복원 중...', backupSuccess: '백업 성공.', restoreSuccess: '복원 성공!', restoreFail: '잘못된 백업 파일입니다.', fileProcessed: '파일 처리됨.', fileSent: '파일이 AI로 전송됨.', errorSending: '파일 전송 오류.', socketError: '소켓 오류', sensorFail: '센서 연결 실패', timeout: '시간 초과', cameraConnected: '카메라 연결됨!',
        scanned: '스캔됨: ', imported: '입고됨 (+1): ', check: '확인: ', unknownCode: '알 수 없는 코드: ', outOfStock: '재고 없음: ', updatedItems: '업데이트된 항목 수: ', toolCalled: '도구 호출: ', toolResult: '결과: '
    }
  }
};

const LANGUAGES = [
  { code: 'vi', flag: '🇻🇳', label: 'VN' },
  { code: 'en', flag: '🇺🇸', label: 'EN' },
  { code: 'zh', flag: '🇨🇳', label: 'ZH' },
  { code: 'ja', flag: '🇯🇵', label: 'JP' },
  { code: 'ko', flag: '🇰🇷', label: 'KR' }
];

// ... (KEEP NUMBER HELPERS AS IS) ...
const DOC_SO = ["không", "một", "hai", "ba", "bốn", "năm", "sáu", "bảy", "tám", "chín"];
const DOC_DON_VI = ["", "nghìn", "triệu", "tỷ", "nghìn tỷ", "triệu tỷ"];
function docSo3ChuSo(n: number, dayDu: boolean): string {
    let str = "";
    const tram = Math.floor(n / 100);
    const chuc = Math.floor((n % 100) / 10);
    const donVi = n % 10;
    if (dayDu || tram > 0) { str += " " + DOC_SO[tram] + " trăm"; str += (chuc === 0 && donVi !== 0) ? " linh" : ""; }
    if (chuc > 1 && chuc !== 0) { str += " " + DOC_SO[chuc] + " mươi"; if (donVi === 1) str += " mốt"; else if (donVi === 5) str += " lăm"; else if (donVi !== 0) str += " " + DOC_SO[donVi]; } else if (chuc === 1) { str += " mười"; if (donVi === 1) str += " một"; else if (donVi === 5) str += " lăm"; else if (donVi !== 0) str += " " + DOC_SO[donVi]; } else if (chuc === 0 && donVi !== 0) { str += " " + DOC_SO[donVi]; }
    return str;
}
function docTienBangChu(number: number): string {
    if (number === 0) return "Không đồng";
    let str = ""; let i = 0;
    while (number > 0) { const n = number % 1000; if (n > 0) { const s = docSo3ChuSo(n, number >= 1000); str = s + " " + DOC_DON_VI[i] + str; } number = Math.floor(number / 1000); i++; }
    str = str.trim(); str = str.charAt(0).toUpperCase() + str.slice(1);
    return str + " đồng chẵn";
}
const ONES = ["", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];
const TEENS = ["ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
const THOUSANDS = ["", "thousand", "million", "billion"];
function numToEnglish(n: number): string {
    if (n === 0) return ""; else if (n < 10) return ONES[n]; else if (n < 20) return TEENS[n - 10]; else if (n < 100) return TENS[Math.floor(n / 10)] + (n % 10 !== 0 ? "-" + ONES[n % 10] : ""); else return ONES[Math.floor(n / 100)] + " hundred" + (n % 100 !== 0 ? " and " + numToEnglish(n % 100) : "");
}
function readMoneyInEnglish(n: number): string {
    if (n === 0) return "Zero VND"; let str = ""; let i = 0; while (n > 0) { if (n % 1000 !== 0) { str = numToEnglish(n % 1000) + " " + THOUSANDS[i] + " " + str; } n = Math.floor(n / 1000); i++; } return str.trim() + " VND";
}

const INITIAL_INVENTORY: Product[] = [
  { id: 'SP001', barcode: '8930001', name: 'iPhone 15 Pro Max', price: 34990000, quantity: 5, unit: 'chiếc', category: 'Điện thoại' },
  { id: 'SP002', barcode: '8930002', name: 'Samsung Galaxy S24 Ultra', price: 31990000, quantity: 8, unit: 'chiếc', category: 'Điện thoại' },
  { id: 'SP003', barcode: '8930003', name: 'MacBook Air M3', price: 27990000, quantity: 3, unit: 'chiếc', category: 'Laptop' },
  { id: 'SP004', barcode: '8930004', name: 'Tai nghe AirPods Pro 2', price: 5990000, quantity: 15, unit: 'cái', category: 'Phụ kiện' },
  { id: 'SP005', barcode: '8930005', name: 'Sạc dự phòng Anker', price: 890000, quantity: 20, unit: 'cục', category: 'Phụ kiện' },
];

const PAYMENT_POLL_INTERVAL_MS = 3000;
const PAYMENT_POLL_MAX = 60;

const SILENT_AUDIO_URI = 'data:audio/mpeg;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4Ljc2LjEwMAAAAAAAAAAAAAAA//OEAAAAAAAAAAAAAAAAAAAAAAAASW5mbwAAAA8AAAAEAAABIADAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMD//////////////////////////////////////////////////////////////////wAAAAAATGF2YzU4LjEzAAAAAAAAAAAAAAAAJAAAAAAAAAAAASAA82xhAAAAAAA//OEZAAAAAAIAAAAAExBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq//OEZAAAAAAIAAAAAExBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq//OEZAAAAAAIAAAAAExBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq//OEZAAAAAAIAAAAAExBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq';
const PROACTIVE_SILENCE_TIMEOUT = 4000;

// Helper to downsample audio to 16kHz
function downsampleTo16k(buffer: Float32Array, sampleRate: number): Int16Array {
  if (sampleRate === 16000) {
    const res = new Int16Array(buffer.length);
    for (let i = 0; i < buffer.length; i++) res[i] = buffer[i] * 32768;
    return res;
  }
  const ratio = sampleRate / 16000;
  const newLength = Math.ceil(buffer.length / ratio);
  const res = new Int16Array(newLength);
  for (let i = 0; i < newLength; i++) {
    const offset = Math.floor(i * ratio);
    const nextOffset = Math.floor((i + 1) * ratio);
    let sum = 0;
    let count = 0;
    for (let j = offset; j < nextOffset && j < buffer.length; j++) {
        sum += buffer[j];
        count++;
    }
    const val = count > 0 ? sum / count : buffer[offset];
    res[i] = Math.max(-32768, Math.min(32767, val * 32768));
  }
  return res;
}

// --- Đa tài khoản: mỗi user có dữ liệu riêng (localStorage + API) ---
function getStoredUser(): UserProfile | null {
  try {
    const s = localStorage.getItem('bm_user_profile');
    return s ? JSON.parse(s) : null;
  } catch {
    return null;
  }
}
function getStorageKey(prefix: string, userEmail?: string | null): string {
  const email = userEmail ?? getStoredUser()?.email;
  if (email) return `${prefix}_${encodeURIComponent(email)}`;
  return prefix;
}
function readLocal<T>(key: string, fallback: T, parse: (s: string) => T): T {
  const raw = localStorage.getItem(key);
  if (!raw) return fallback;
  try {
    return parse(raw);
  } catch {
    return fallback;
  }
}

const App: React.FC = () => {
  // --- AUTH & SUBSCRIPTION STATE ---
  const [user, setUser] = useState<UserProfile | null>(() => {
    const saved = localStorage.getItem('bm_user_profile');
    if (!saved) return null;
    try {
      const profile = JSON.parse(saved) as UserProfile;
      // Không dùng tài khoản demo — bắt buộc đăng nhập Google
      if (profile?.email === 'demo@baominh.ai') {
        localStorage.removeItem('bm_user_profile');
        return null;
      }
      return profile;
    } catch {
      return null;
    }
  });
  const [showLoginModal, setShowLoginModal] = useState(!user);
  const [showPaywall, setShowPaywall] = useState(false);
  const [clientIp, setClientIp] = useState<string>('');
  const [dailyMinutesUsed, setDailyMinutesUsed] = useState(0);
  const [trialDaysLeft, setTrialDaysLeft] = useState(0);
  const [isForcedLock, setIsForcedLock] = useState(false);
  
  // Payment Modal State
  const [selectedPlan, setSelectedPlan] = useState<PricingPlan | null>(null);
  const [isVerifyingPayment, setIsVerifyingPayment] = useState(false);
  const [paymentSuccess, setPaymentSuccess] = useState<{ startDate: number; endDate: number } | null>(null);
  const [paymentVerifyError, setPaymentVerifyError] = useState<string | null>(null);
  const paymentPollCountRef = useRef(0);
  const [kickedMessage, setKickedMessage] = useState<string | null>(null);
  const [deviceRegisteredRevoked, setDeviceRegisteredRevoked] = useState(false);
  const sessionCheckIntervalRef = useRef<number | null>(null);

  // --- STATE QUẢN LÝ ---
  const [keyPool, setKeyPool] = useState<string[]>(() => readLocal(getStorageKey('gemini_key_pool'), [], (s) => JSON.parse(s)) || readLocal('gemini_key_pool', [], (s) => JSON.parse(s)));
  const [newKeyInput, setNewKeyInput] = useState('');
  const [activeKeyIndex, setActiveKeyIndex] = useState(0);

  // --- STORE BRANDING ---
  const [storeName, setStoreName] = useState<string>(() => localStorage.getItem(getStorageKey('gemini_store_name')) || localStorage.getItem('gemini_store_name') || 'Bảo Minh AI');
  const [storeWebsite, setStoreWebsite] = useState<string>(() => localStorage.getItem(getStorageKey('gemini_store_website')) || localStorage.getItem('gemini_store_website') || 'baominh.io.vn');
  const [storeHotline, setStoreHotline] = useState<string>(() => localStorage.getItem(getStorageKey('gemini_store_hotline')) || localStorage.getItem('gemini_store_hotline') || '0986234983');
  const [storeAddress, setStoreAddress] = useState<string>(() => localStorage.getItem(getStorageKey('gemini_store_address')) || localStorage.getItem('gemini_store_address') || 'Hà Nội');
  
  const [language, setLanguage] = useState<'vi' | 'en' | 'zh' | 'ja' | 'ko'>(() => (localStorage.getItem(getStorageKey('gemini_lang')) || localStorage.getItem('gemini_lang') || 'vi') as any);
  const t = TRANSLATIONS[language]; 

  // State Kho & POS
  const [inventory, setInventory] = useState<Product[]>(() => readLocal(getStorageKey('gemini_inventory'), INITIAL_INVENTORY, (s) => JSON.parse(s)) || readLocal('gemini_inventory', INITIAL_INVENTORY, (s) => JSON.parse(s)) || INITIAL_INVENTORY);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [currentInvoice, setCurrentInvoice] = useState<Invoice | null>(null);
  const [stockLogs, setStockLogs] = useState<StockLog[]>(() => readLocal(getStorageKey('gemini_stock_logs'), [], (s) => JSON.parse(s))); 
  const [isCheckoutModalOpen, setIsCheckoutModalOpen] = useState(false);
  const [checkoutForm, setCheckoutForm] = useState({ name: '', phone: '', address: '' });

  // State CRM
  const [customers, setCustomers] = useState<Customer[]>(() => readLocal(getStorageKey('gemini_customers'), [], (s) => JSON.parse(s)) || readLocal('gemini_customers', [], (s) => JSON.parse(s)));
  const [preOrders, setPreOrders] = useState<PreOrder[]>(() => readLocal(getStorageKey('gemini_preorders'), [], (s) => JSON.parse(s)) || readLocal('gemini_preorders', [], (s) => JSON.parse(s)));
  const [crmSearch, setCrmSearch] = useState('');
  const [userRole, setUserRole] = useState<'STAFF' | 'CUSTOMER'>('CUSTOMER');

  // UI States
  const [storeDocs, setStoreDocs] = useState<string>(() => localStorage.getItem(getStorageKey('gemini_store_docs')) || localStorage.getItem('gemini_store_docs') || '');
  const [esp32Ip, setEsp32Ip] = useState<string>(() => localStorage.getItem(getStorageKey('gemini_esp32_ip')) || localStorage.getItem('gemini_esp32_ip') || '');
  const [uiAudio, setUiAudio] = useState<UIAudioSettings>(() => readLocal(getStorageKey('gemini_ui_audio'), { enabled: true, profile: 'default', volume: 0.5 }, (s) => JSON.parse(s)) || readLocal('gemini_ui_audio', { enabled: true, profile: 'default', volume: 0.5 }, (s) => JSON.parse(s)));
  const [isUserSpeaking, setIsUserSpeaking] = useState(false);
  const [isAISpeaking, setIsAISpeaking] = useState(false);
  const [sidebarTab, setSidebarTab] = useState<'chat' | 'inventory' | 'crm' | 'settings' | 'logs'>('chat');
  const [inventoryMode, setInventoryMode] = useState<'POS' | 'IMPORT' | 'CHECK'>('POS'); 
  const [isSidebarOpen, setIsSidebarOpen] = useState(false); 
  const [status, setStatus] = useState<SessionStatus>(SessionStatus.IDLE);
  const [isStandby, setIsStandby] = useState(false); 
  const [transcriptions, setTranscriptions] = useState<Transcription[]>(() => { try { return readLocal(getStorageKey('gemini_chat_history'), [], (s) => JSON.parse(s)) || readLocal('gemini_chat_history', [], (s) => JSON.parse(s)); } catch { return []; } });
  const [isMuted, setIsMuted] = useState(false);
  const [showLogs, setShowLogs] = useState(false);
  const [logs, setLogs] = useState<DebugLog[]>([]);
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const [showCameraPreview, setShowCameraPreview] = useState(true);
  const [scannedProduct, setScannedProduct] = useState<Product | null>(null);
  const [isVoiceOnly, setIsVoiceOnly] = useState<boolean>(() => (localStorage.getItem(getStorageKey('gemini_voice_only')) || localStorage.getItem('gemini_voice_only')) === 'true');
  const [isSensorMode, setIsSensorMode] = useState<boolean>(() => (localStorage.getItem(getStorageKey('gemini_sensor_mode')) || localStorage.getItem('gemini_sensor_mode')) === 'true');
  const [useRemoteMic, setUseRemoteMic] = useState<boolean>(() => (localStorage.getItem(getStorageKey('gemini_remote_mic')) || localStorage.getItem('gemini_remote_mic')) === 'true');
  const [motionDetected, setMotionDetected] = useState(false);
  const [inventoryText, setInventoryText] = useState('');
  const [camCheckStatus, setCamCheckStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [isCheckingCam, setIsCheckingCam] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  // Refs
  const audioContextRef = useRef<AudioContext | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const sessionPromiseRef = useRef<Promise<any> | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const transcriptionBufferRef = useRef({ user: '', model: '' });
  const docInputRef = useRef<HTMLInputElement>(null);
  const catalogInputRef = useRef<HTMLInputElement>(null);
  const importFileInputRef = useRef<HTMLInputElement>(null);
  const databaseInputRef = useRef<HTMLInputElement>(null);
  const speakingTimeoutRef = useRef<number | null>(null);
  const activeSessionRef = useRef<any>(null);
  const silentAudioRef = useRef<HTMLAudioElement>(null);
  const wakeLockRef = useRef<any>(null);
  const inventoryRef = useRef<Product[]>(inventory);
  const customersRef = useRef<Customer[]>(customers);
  const barcodeBufferRef = useRef<string>('');
  const barcodeTimeoutRef = useRef<number | null>(null);
  const intentionalDisconnectRef = useRef<boolean>(false);
  const retryCountRef = useRef<number>(0);
  const silenceTimerRef = useRef<number | null>(null);
  const saveStoreTimeoutRef = useRef<number | null>(null);
  const sensorIntervalRef = useRef<number | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const usageTimerRef = useRef<number | null>(null);
  const checkoutPhaseRef = useRef<'idle' | 'checkout'>('idle');
  const cartRef = useRef<CartItem[]>(cart); 
  const checkoutFormRef = useRef(checkoutForm); // Ref for sync
  const volumeThreshold = 0.003;
  const noiseFloorRef = useRef<number>(0.005);

  // Sync Cart Ref
  useEffect(() => {
      cartRef.current = cart;
  }, [cart]);

  // Sync CheckoutForm Ref
  useEffect(() => {
      checkoutFormRef.current = checkoutForm;
  }, [checkoutForm]);

  // --- EFFECT: NETWORK MONITORING ---
  useEffect(() => {
    const handleOnline = () => {
        setIsOnline(true);
        addLog("Network Online - Attempting Reconnect...", "info");
        if (!intentionalDisconnectRef.current && status === SessionStatus.IDLE) {
            // Reconnect if we were disconnected unintentionally
            setTimeout(() => connectToAI(), 1000);
        }
    };
    const handleOffline = () => {
        setIsOnline(false);
        addLog("Network Offline!", "error");
        // Don't force disconnect here, let the WebSocket handle timeout, but UI shows offline
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
    };
  }, [status]);

  // --- EFFECT: AUTO DOWNLOAD INVOICE ---
  useEffect(() => {
    if (currentInvoice) {
        // Wait for render, then auto download
        const timer = setTimeout(() => {
            handleDownloadPDF();
        }, 1000);
        return () => clearTimeout(timer);
    }
  }, [currentInvoice]);

  // --- EFFECT: AUTH & USAGE TRACKING ---
  // 1. Get Client IP
  useEffect(() => {
    fetch('https://api.ipify.org?format=json')
      .then(res => res.json())
      .then(data => setClientIp(data.ip))
      .catch(() => setClientIp('unknown-ip'));
  }, []);

  // 2. Logic tính toán giới hạn
  const checkLimits = useCallback(() => {
    if (!user || user.isPremium) return { blocked: false, reason: null };

    // Check Trial Expiry (14 days)
    const now = Date.now();
    const daysUsed = Math.floor((now - user.trialStartDate) / (1000 * 60 * 60 * 24));
    const left = Math.max(0, TRIAL_DAYS - daysUsed);
    setTrialDaysLeft(left);

    if (daysUsed > TRIAL_DAYS) {
        return { blocked: true, reason: t.trialExpired };
    }

    // Check Daily Limit (30 phút / tài khoản)
    const todayStr = new Date().toISOString().slice(0, 10);
    const usageKey = `bm_usage_${todayStr}_${user?.email || clientIp}`;
    const used = parseInt(localStorage.getItem(usageKey) || '0');
    setDailyMinutesUsed(used);

    if (used >= DAILY_LIMIT_MINUTES) {
        return { blocked: true, reason: t.limitReached };
    }

    return { blocked: false, reason: null };
  }, [user, clientIp, t]);

  // 3. Interval Tracking Usage (runs every minute when Connected)
  useEffect(() => {
    if (status === SessionStatus.CONNECTED && user && !user.isPremium && clientIp) {
        usageTimerRef.current = window.setInterval(() => {
            const todayStr = new Date().toISOString().slice(0, 10);
            const usageKey = `bm_usage_${todayStr}_${user?.email || clientIp}`;
            const current = parseInt(localStorage.getItem(usageKey) || '0');
            const updated = current + 1;
            localStorage.setItem(usageKey, updated.toString());
            setDailyMinutesUsed(updated);

            if (updated >= DAILY_LIMIT_MINUTES) {
                disconnectFromAI(); 
                setShowPaywall(true);
                setIsForcedLock(true); // STRICT LOCK
            }
        }, 60000); // 1 minute
    } else {
        if (usageTimerRef.current) clearInterval(usageTimerRef.current);
    }
    return () => { if (usageTimerRef.current) clearInterval(usageTimerRef.current); };
  }, [status, user, clientIp]);

  // 4. Check limits on mount/updates and enforce strict lock
  useEffect(() => {
      const { blocked } = checkLimits();
      if (blocked) {
          setShowPaywall(true);
          setIsForcedLock(true);
      } else {
          setIsForcedLock(false);
      }
  }, [checkLimits, dailyMinutesUsed]);

  const googleClientId = (import.meta as any).env?.VITE_GOOGLE_CLIENT_ID as string | undefined;
  const [loginError, setLoginError] = useState<string | null>(null);

  // --- HANDLERS FOR AUTH & PAYMENT ---
  const handleGoogleLoginSuccess = async (credentialResponse: { credential?: string }) => {
      setLoginError(null);
      if (!credentialResponse.credential) return;
      try {
          const decoded = jwtDecode<{ email?: string; name?: string }>(credentialResponse.credential);
          const trialStart = Date.now();
          const profile: UserProfile = {
              email: decoded.email || 'user@gmail.com',
              name: decoded.name || 'User',
              trialStartDate: trialStart,
              isPremium: false
          };
          setUser(profile);
          localStorage.setItem('bm_user_profile', JSON.stringify(profile));
          setShowLoginModal(false);
          triggerUISound('success');
          // Đồng bộ user lên VPS: tạo/cập nhật danh sách người dùng để quản lý và gia hạn
          if (isApiConfigured()) {
              const reg = await registerUserOnServer({ email: profile.email, name: profile.name, trialStartDate: trialStart });
              if (reg?.userProfile) {
                  setUser((prev) => prev ? { ...prev, ...reg.userProfile } : prev);
                  const merged = { ...profile, ...reg.userProfile };
                  localStorage.setItem('bm_user_profile', JSON.stringify(merged));
              }
          }
      } catch (e) {
          console.error('Google login decode error', e);
          setLoginError('Đăng nhập thất bại. Vui lòng thử lại.');
      }
  };

  const applyPaymentSuccess = useCallback((startDate: number, endDate: number) => {
      if (!user) return;
      const updatedUser = { ...user, isPremium: true, premiumStartDate: startDate, expiryDate: endDate };
      setUser(updatedUser);
      localStorage.setItem('bm_user_profile', JSON.stringify(updatedUser));
      setPaymentSuccess({ startDate, endDate });
      setIsForcedLock(false);
      setSelectedPlan(null);
      setIsVerifyingPayment(false);
      triggerUISound('success');
  }, [user]);

  const handleConfirmPayment = useCallback(async () => {
      if (!selectedPlan || !user) return;
      setPaymentVerifyError(null);
      setIsVerifyingPayment(true);
      const now = Date.now();
      const durationMs = selectedPlan.durationMonths * 30 * 24 * 60 * 60 * 1000;
      const endDate = now + durationMs;

      if (!isApiConfigured()) {
          setIsVerifyingPayment(false);
          setPaymentVerifyError('Chưa thể xác nhận thanh toán. Vui lòng cấu hình VITE_API_URL (backend) để xác thực qua SePay.');
          return;
      }

      const orderRes = await createPaymentOrder({
          userId: user.email,
          userEmail: user.email,
          planId: selectedPlan.id,
          amount: selectedPlan.price,
          description: `BAOMINH ${user.email?.split('@')[0]} ${selectedPlan.id}`,
      });

      if (!orderRes?.orderId) {
          setIsVerifyingPayment(false);
          setPaymentVerifyError('Tạo đơn thanh toán thất bại. Vui lòng thử lại hoặc liên hệ Zalo ' + ZALO_PHONE);
          return;
      }

      paymentPollCountRef.current = 0;
      const poll = async () => {
          if (paymentPollCountRef.current >= PAYMENT_POLL_MAX) {
              setIsVerifyingPayment(false);
              setPaymentVerifyError('Chưa nhận được xác nhận thanh toán từ ngân hàng. Nếu bạn đã chuyển khoản, vui lòng đợi vài phút hoặc liên hệ Zalo ' + ZALO_PHONE + ' để được hỗ trợ.');
              return;
          }
          paymentPollCountRef.current += 1;
          const statusRes = await checkPaymentStatus(orderRes.orderId);
          if (statusRes?.status === 'paid' && statusRes.startDate != null && statusRes.endDate != null) {
              applyPaymentSuccess(statusRes.startDate, statusRes.endDate);
              return;
          }
          if (statusRes?.status === 'paid') {
              applyPaymentSuccess(now, endDate);
              return;
          }
          setTimeout(poll, PAYMENT_POLL_INTERVAL_MS);
      };
      setTimeout(poll, PAYMENT_POLL_INTERVAL_MS);
  }, [selectedPlan, user, applyPaymentSuccess]);

  const handleClosePaymentSuccess = () => {
      setPaymentSuccess(null);
      setPaymentVerifyError(null);
      setShowPaywall(false);
  };

  // Xóa thông báo lỗi thanh toán khi mở lại modal gia hạn
  useEffect(() => {
      if (showPaywall) setPaymentVerifyError(null);
  }, [showPaywall]);

  const handleLogout = () => {
      triggerUISound('click');
      if (status === SessionStatus.CONNECTED) disconnectFromAI();
      setUser(null);
      localStorage.removeItem('bm_user_profile');
      setLoginError(null);
      setShowLoginModal(true);
      setShowPaywall(false);
      setCart([]);
      setCurrentInvoice(null);
      setPaymentSuccess(null);
      addLog('Đã đăng xuất.', 'info');
  };

  const getSePayQrUrl = (amount: number, content: string) => {
      return `https://qr.sepay.vn/img?bank=${SEPAY_BANK_NAME}&acc=${SEPAY_BANK_ACC}&template=${SEPAY_TEMPLATE}&amount=${amount}&des=${encodeURIComponent(content)}`;
  };

  // --- EFFECT: Lưu dữ liệu theo từng tài khoản (localStorage key có suffix email) ---
  useEffect(() => {
    if (!user?.email) return; // Chỉ lưu khi đã đăng nhập
    const k = (prefix: string) => getStorageKey(prefix, user.email);
    localStorage.setItem(k('gemini_key_pool'), JSON.stringify(keyPool));
    localStorage.setItem(k('gemini_inventory'), JSON.stringify(inventory));
    localStorage.setItem(k('gemini_customers'), JSON.stringify(customers));
    localStorage.setItem(k('gemini_preorders'), JSON.stringify(preOrders));
    localStorage.setItem(k('gemini_stock_logs'), JSON.stringify(stockLogs));
    localStorage.setItem(k('gemini_store_docs'), storeDocs);
    localStorage.setItem(k('gemini_ui_audio'), JSON.stringify(uiAudio));
    localStorage.setItem(k('gemini_esp32_ip'), esp32Ip);
    localStorage.setItem(k('gemini_voice_only'), String(isVoiceOnly));
    localStorage.setItem(k('gemini_sensor_mode'), String(isSensorMode));
    localStorage.setItem(k('gemini_remote_mic'), String(useRemoteMic));
    localStorage.setItem(k('gemini_store_name'), storeName);
    localStorage.setItem(k('gemini_store_website'), storeWebsite);
    localStorage.setItem(k('gemini_store_hotline'), storeHotline);
    localStorage.setItem(k('gemini_store_address'), storeAddress);
    localStorage.setItem(k('gemini_lang'), language);
    if (transcriptions.length > 0) {
      localStorage.setItem(k('gemini_chat_history'), JSON.stringify(transcriptions.slice(-50)));
      localStorage.setItem(k('gemini_last_active_ts'), String(Date.now()));
    }
    inventoryRef.current = inventory;
    customersRef.current = customers;
  }, [user?.email, keyPool, inventory, storeDocs, uiAudio, esp32Ip, isVoiceOnly, isSensorMode, useRemoteMic, customers, preOrders, stockLogs, storeName, transcriptions, storeWebsite, storeHotline, storeAddress, language]);

  // Khi đổi tài khoản: load dữ liệu của user đó từ localStorage (tài khoản mới không có data thì dùng mặc định)
  useEffect(() => {
    if (!user?.email) return;
    const k = (p: string) => getStorageKey(p, user.email);
    const rawInv = localStorage.getItem(k('gemini_inventory')); setInventory(rawInv ? (() => { try { return JSON.parse(rawInv); } catch { return INITIAL_INVENTORY; } })() : INITIAL_INVENTORY);
    const rawCust = localStorage.getItem(k('gemini_customers')); setCustomers(rawCust ? (() => { try { return JSON.parse(rawCust); } catch { return []; } })() : []);
    const rawPO = localStorage.getItem(k('gemini_preorders')); setPreOrders(rawPO ? (() => { try { return JSON.parse(rawPO); } catch { return []; } })() : []);
    const rawLogs = localStorage.getItem(k('gemini_stock_logs')); setStockLogs(rawLogs ? (() => { try { return JSON.parse(rawLogs); } catch { return []; } })() : []);
    const name = localStorage.getItem(k('gemini_store_name')); setStoreName(name || 'Bảo Minh AI');
    const web = localStorage.getItem(k('gemini_store_website')); setStoreWebsite(web || 'baominh.io.vn');
    const hot = localStorage.getItem(k('gemini_store_hotline')); setStoreHotline(hot || '0986234983');
    const addr = localStorage.getItem(k('gemini_store_address')); setStoreAddress(addr || 'Hà Nội');
    const docs = localStorage.getItem(k('gemini_store_docs')); setStoreDocs(docs || '');
    const lang = localStorage.getItem(k('gemini_lang')); setLanguage((lang as 'vi' | 'en') || 'vi');
    const keyP = localStorage.getItem(k('gemini_key_pool')); setKeyPool(keyP ? (() => { try { return JSON.parse(keyP); } catch { return []; } })() : []);
    const ui = localStorage.getItem(k('gemini_ui_audio')); setUiAudio(ui ? (() => { try { return JSON.parse(ui); } catch { return { enabled: true, profile: 'default', volume: 0.5 }; } })() : { enabled: true, profile: 'default', volume: 0.5 });
    const ip = localStorage.getItem(k('gemini_esp32_ip')); setEsp32Ip(ip || '');
    const voice = localStorage.getItem(k('gemini_voice_only')); setIsVoiceOnly(voice === 'true');
    const sensor = localStorage.getItem(k('gemini_sensor_mode')); setIsSensorMode(sensor === 'true');
    const mic = localStorage.getItem(k('gemini_remote_mic')); setUseRemoteMic(mic === 'true');
    const chat = localStorage.getItem(k('gemini_chat_history')); setTranscriptions(chat ? (() => { try { return JSON.parse(chat); } catch { return []; } })() : []);
  }, [user?.email]);

  // Load store data từ VPS khi đã đăng nhập và cấu hình API (ghi đè lên localStorage, đồng bộ gói đăng ký)
  useEffect(() => {
    if (!user?.email || !isApiConfigured()) return;
    loadStoreData(user.email).then((data) => {
      if (!data) return;
      if (data.userProfile) setUser((prev) => (prev ? { ...prev, ...data!.userProfile } : prev));
      if (data.inventory && data.inventory.length > 0) setInventory(data.inventory);
      if (data.customers && data.customers.length > 0) setCustomers(data.customers);
      if (data.preOrders && data.preOrders.length > 0) setPreOrders(data.preOrders);
      if (data.stockLogs && data.stockLogs.length > 0) setStockLogs(data.stockLogs);
      if (data.storeName) setStoreName(data.storeName);
      if (data.storeWebsite != null) setStoreWebsite(data.storeWebsite);
      if (data.storeHotline != null) setStoreHotline(data.storeHotline);
      if (data.storeAddress != null) setStoreAddress(data.storeAddress);
      if (data.storeDocs != null) setStoreDocs(data.storeDocs);
      if (data.language) setLanguage(data.language as 'vi' | 'en');
      if (data.keyPool && data.keyPool.length > 0) setKeyPool(data.keyPool);
    });
  }, [user?.email]);

  // Giới hạn Premium: 1 thiết bị — đăng ký thiết bị + kiểm tra phiên định kỳ, đăng xuất thiết bị cũ khi đăng nhập thiết bị mới
  useEffect(() => {
    if (!user?.email || !user?.isPremium || !isApiConfigured()) {
      if (sessionCheckIntervalRef.current) {
        clearInterval(sessionCheckIntervalRef.current);
        sessionCheckIntervalRef.current = null;
      }
      return;
    }
    const deviceId = getOrCreateDeviceId();
    registerDevice(user.email, deviceId).then((res) => {
      if (res?.previousDeviceRevoked) setDeviceRegisteredRevoked(true);
    });
    sessionCheckIntervalRef.current = window.setInterval(async () => {
      const session = await checkSession(user.email, deviceId);
      if (session && !session.valid) {
        if (sessionCheckIntervalRef.current) {
          clearInterval(sessionCheckIntervalRef.current);
          sessionCheckIntervalRef.current = null;
        }
        setKickedMessage('Tài khoản đã đăng nhập trên thiết bị khác. Bạn đã bị đăng xuất.');
        if (status === SessionStatus.CONNECTED) {
          if (activeSessionRef.current) { try { activeSessionRef.current.close(); } catch {} }
          activeSessionRef.current = null;
          setStatus(SessionStatus.IDLE);
          setIsUserSpeaking(false);
          setIsAISpeaking(false);
        }
        setUser(null);
        localStorage.removeItem('bm_user_profile');
        setShowLoginModal(true);
        setShowPaywall(false);
        setCart([]);
        setPaymentSuccess(null);
      }
    }, 45000);
    return () => {
      if (sessionCheckIntervalRef.current) {
        clearInterval(sessionCheckIntervalRef.current);
        sessionCheckIntervalRef.current = null;
      }
    };
  }, [user?.email, user?.isPremium, status]);

  // Đồng bộ dữ liệu cửa hàng lên VPS (debounce 2s)
  useEffect(() => {
    if (!user?.email || !isApiConfigured()) return;
    if (saveStoreTimeoutRef.current) clearTimeout(saveStoreTimeoutRef.current);
    saveStoreTimeoutRef.current = window.setTimeout(() => {
      saveStoreData({
        userId: user.email,
        storeName,
        storeWebsite,
        storeHotline,
        storeAddress,
        storeDocs,
        inventory,
        customers,
        preOrders,
        stockLogs,
        keyPool,
        language,
      }).then(() => { saveStoreTimeoutRef.current = null; });
    }, 2000);
    return () => {
      if (saveStoreTimeoutRef.current) clearTimeout(saveStoreTimeoutRef.current);
    };
  }, [user?.email, storeName, storeWebsite, storeHotline, storeAddress, storeDocs, inventory, customers, preOrders, stockLogs, keyPool, language]);

  useEffect(() => {
      const text = inventory.map(p => `${p.name} | ${p.price} | ${p.quantity}`).join('\n');
      setInventoryText(text);
  }, [inventory]);

  // Wake Lock with better error handling
  useEffect(() => {
    const requestWakeLock = async () => {
       if ((status === SessionStatus.CONNECTED || isStandby) && 'wakeLock' in navigator && !wakeLockRef.current) {
          try {
             wakeLockRef.current = await (navigator as any).wakeLock.request('screen');
             console.log("Wake Lock active");
          } catch (e: any) { 
             if (e.name !== 'NotAllowedError') {
                 console.log("Wake Lock failed (non-critical)", e.name);
             }
          }
       }
    };
    requestWakeLock();
    const handleVisChange = () => {
        if (document.visibilityState === 'visible' && (status === SessionStatus.CONNECTED || isStandby)) requestWakeLock();
    };
    document.addEventListener('visibilitychange', handleVisChange);
    return () => {
        document.removeEventListener('visibilitychange', handleVisChange);
        if (wakeLockRef.current) { try { wakeLockRef.current.release(); } catch(e) {} wakeLockRef.current = null; }
    }
  }, [status, isStandby]);

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (cart.length > 0 || status === SessionStatus.CONNECTED) {
        e.preventDefault();
        e.returnValue = ''; 
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [cart, status]);

  // --- SENSOR POLLING LOGIC ---
  useEffect(() => {
    if (isSensorMode && esp32Ip && !useRemoteMic) {
      sensorIntervalRef.current = window.setInterval(async () => {
         if (status === SessionStatus.CONNECTED && (isAISpeaking || isUserSpeaking)) return;
         try {
           const controller = new AbortController();
           const timeoutId = setTimeout(() => controller.abort(), 1000);
           let url = esp32Ip.startsWith('http') ? esp32Ip : `http://${esp32Ip}`;
           url = `${url}/status`; 
           const response = await fetch(url, { signal: controller.signal }).catch(() => null);
           clearTimeout(timeoutId);
           if (response && response.ok) {
             const data = await response.json().catch(() => ({ motion: 0 }));
             if (data.motion || data.pir) { 
               setMotionDetected(true);
               if (status === SessionStatus.IDLE) {
                   addLog(t.logs.motionDetected, "info");
                   triggerUISound('success');
                   connectToAI(); 
               }
             } else {
               setMotionDetected(false);
             }
           }
         } catch (e) {}
      }, 2000);
    }
    return () => { if (sensorIntervalRef.current) clearInterval(sensorIntervalRef.current); };
  }, [isSensorMode, esp32Ip, status, isAISpeaking, isUserSpeaking, useRemoteMic, t]);

  // --- BARCODE LISTENER ---
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'TEXTAREA') return;
      if (e.key === 'Enter') {
        if (barcodeBufferRef.current.length > 2) handleBarcodeScan(barcodeBufferRef.current);
        barcodeBufferRef.current = '';
      } else if (e.key.length === 1) {
        barcodeBufferRef.current += e.key;
        if (barcodeTimeoutRef.current) window.clearTimeout(barcodeTimeoutRef.current);
        barcodeTimeoutRef.current = window.setTimeout(() => { barcodeBufferRef.current = ''; }, 100); 
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [userRole, inventoryMode]);

  // --- LOGIC FUNCTIONS (EXISTING) ---
  const triggerUISound = useCallback((type: 'click' | 'success') => {
    if (uiAudio.enabled) playUISound(type, uiAudio.profile, uiAudio.volume);
  }, [uiAudio]);

  const addLog = useCallback((message: string, type: 'info' | 'api' | 'error' | 'warning' = 'info') => {
    const newLog: DebugLog = { id: Math.random().toString(36).substr(2, 9), timestamp: new Date().toLocaleTimeString(), message, type };
    setLogs(prev => [newLog, ...prev].slice(0, 50));
  }, []);

  const handleClearInventory = () => {
    if (inventory.length === 0) return;
    const ok = window.confirm('Bạn có chắc muốn xóa toàn bộ danh sách sản phẩm khỏi POS? Hành động này không thể hoàn tác.');
    if (!ok) return;
    setInventory([]);
    addLog('Đã xóa toàn bộ danh sách sản phẩm.', 'warning');
  };

  const updateInventoryFromText = (text: string) => {
      const lines = text.split('\n');
      const newInventory: Product[] = [];
      lines.forEach((line, index) => {
          const parts = line.split('|');
          if (parts.length >= 2) {
              const name = parts[0].trim();
              const price = parseInt(parts[1].trim().replace(/[^0-9]/g, '')) || 0;
              const quantity = parts[2] ? parseInt(parts[2].trim()) : 0;
              if (name) {
                  const existing = inventoryRef.current.find(p => p.name === name);
                  newInventory.push({
                      id: existing?.id || `SP-${Date.now()}-${index}`,
                      name,
                      price,
                      quantity,
                      unit: existing?.unit || 'cái',
                      category: existing?.category || 'Chung',
                      barcode: existing?.barcode
                  });
              }
          }
      });
      if (newInventory.length > 0) {
          setInventory(newInventory);
          addLog(`${t.logs.updatedItems}${newInventory.length}`, 'success');
      }
  };

  const handleBackupDatabase = () => {
      triggerUISound('click');
      const data = { storeName, inventory, customers, preOrders, stockLogs, keyPool, chatHistory: transcriptions };
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = `BaoMinhAI_Backup_${new Date().toISOString().slice(0,10)}.json`; a.click();
      URL.revokeObjectURL(url);
      addLog(t.logs.backupSuccess, 'success');
  };

  const handleRestoreDatabase = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
          try {
              const data = JSON.parse(ev.target?.result as string);
              if (data.inventory) setInventory(data.inventory);
              if (data.customers) setCustomers(data.customers);
              if (data.preOrders) setPreOrders(data.preOrders);
              if (data.stockLogs) setStockLogs(data.stockLogs);
              if (data.storeName) setStoreName(data.storeName);
              if (data.keyPool) setKeyPool(data.keyPool);
              if (data.chatHistory) setTranscriptions(data.chatHistory);
              addLog(t.logs.restoreSuccess, 'success'); triggerUISound('success');
          } catch (err) { addLog(t.logs.restoreFail, 'error'); }
      };
      reader.readAsText(file);
  };

  const handleInventoryTextBlur = () => { updateInventoryFromText(inventoryText); };

  const handleCatalogUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    triggerUISound('click');
    if (file.name.match(/\.(txt|csv|json|org|md)$/i) || file.type === "text/plain" || file.type === "text/csv") {
        const reader = new FileReader();
        reader.onload = (ev) => {
            const content = ev.target?.result as string;
            let formattedText = content;
            if (file.name.endsWith('.csv')) {
                 formattedText = content.split('\n').map(line => line.includes(',') && !line.includes('|') ? line.replace(/,/g, '|') : line).join('\n');
            }
            if (formattedText) { setInventoryText(formattedText); updateInventoryFromText(formattedText); }
        };
        reader.readAsText(file);
    }
  };

  const handleBarcodeScan = (code: string) => {
    triggerUISound('click');
    const product = inventoryRef.current.find(p => p.barcode === code || p.id === code);
    if (product) {
        if (inventoryMode === 'CHECK' || (userRole === 'STAFF' && inventoryMode === 'CHECK')) {
            setScannedProduct(product); addLog(`${t.logs.check}${product.name} (Qty: ${product.quantity})`, 'info');
        } else if (userRole === 'STAFF' && inventoryMode === 'IMPORT') {
            importStock(product.name, 1); addLog(`${t.logs.imported}${product.name}`, 'info');
        } else {
            addToCart(product); addLog(`${t.logs.scanned}${product.name}`, 'success');
        }
    } else { addLog(`${t.logs.unknownCode}${code}`, 'error'); }
  };

  const addToCart = (product: Product, qty: number = 1) => {
    if (product.quantity < qty) { addLog(`${t.logs.outOfStock}${product.name}`, 'error'); return false; }
    setCart(prev => {
      const existing = prev.find(item => item.id === product.id);
      return existing ? prev.map(item => item.id === product.id ? { ...item, cartQty: item.cartQty + qty } : item) : [...prev, { ...product, cartQty: qty }];
    });
    setInventory(prev => prev.map(item => item.id === product.id ? { ...item, quantity: item.quantity - qty } : item));
    triggerUISound('click'); return true;
  };

  const removeFromCart = (id: string) => {
    const item = cart.find(i => i.id === id); if (!item) return;
    setInventory(prev => prev.map(p => p.id === id ? { ...p, quantity: p.quantity + item.cartQty } : p));
    setCart(prev => prev.filter(i => i.id !== id)); triggerUISound('click');
  };

  const importStock = (productName: string, qty: number) => {
    const product = inventoryRef.current.find(p => p.name.toLowerCase().includes(productName.toLowerCase()));
    if (product) {
      setInventory(prev => prev.map(p => p.id === product.id ? { ...p, quantity: p.quantity + qty } : p));
      setStockLogs(prev => [{ id: Math.random().toString(36), date: new Date().toLocaleString('vi-VN'), productName: product.name, change: qty, reason: 'Nhập hàng (Thủ công/AI)' }, ...prev]);
      return true;
    }
    return false;
  };

  const handleRegisterCustomer = (name: string, phone: string, address: string = '', notes: string = ''): Customer => {
      const existing = customersRef.current.find(c => c.phone === phone); 
      if (existing) {
          return existing;
      }
      const newCustomer: Customer = { id: `CUS-${Date.now()}`, name, phone, address, totalSpent: 0, lastVisit: new Date().toLocaleString('vi-VN'), notes };
      setCustomers(prev => [...prev, newCustomer]); return newCustomer;
  };

  const handleCreatePreOrder = (phone: string, productReq: string, qty: number) => {
      const customer = customersRef.current.find(c => c.phone === phone);
      if (!customer) return 'Cần đăng ký thông tin khách trước.';
      setPreOrders(prev => [{ id: `PO-${Date.now()}`, customerId: customer.id, customerName: customer.name, customerPhone: customer.phone, productRequest: productReq, quantity: qty, date: new Date().toLocaleString('vi-VN'), status: 'PENDING' }, ...prev]);
      setSidebarTab('crm'); return `Đã tạo đơn đặt hàng ${productReq} thành công.`;
  };

  const handleOpenCheckout = () => {
      if (cart.length === 0) return;
      setIsCheckoutModalOpen(true);
      triggerUISound('click');
  };

  const handleConfirmCheckout = (itemsOverride?: CartItem[]) => {
    const itemsToCheckout = (Array.isArray(itemsOverride) ? itemsOverride : undefined) || cartRef.current;
    
    if (itemsToCheckout.length === 0) return;

    const currentForm = checkoutFormRef.current;

    if (!currentForm.name || !currentForm.phone || !currentForm.address) {
        addLog(t.validationError, "warning");
        return;
    }

    const subtotal = itemsToCheckout.reduce((sum, item) => sum + (item.price * item.cartQty), 0);
    const tax = 0; 
    const total = subtotal + tax;
    
    const totalQty = itemsToCheckout.reduce((sum, item) => sum + item.cartQty, 0);
    const isWholesale = subtotal > 2000000 || totalQty > 10;
    
    handleRegisterCustomer(currentForm.name, currentForm.phone, currentForm.address);

    const invoice: Invoice = { 
        id: `${Math.floor(Date.now()/1000).toString().slice(-6)}`, 
        date: new Date().toLocaleString(language === 'en' ? 'en-US' : 'vi-VN'), 
        items: [...itemsToCheckout], 
        subtotal,
        tax,
        total, 
        customerName: currentForm.name,
        customerPhone: currentForm.phone,
        customerAddress: currentForm.address,
        type: 'EXPORT',
        isWholesale
    };
    
    setCurrentInvoice(invoice);
    setCart([]);
    setIsCheckoutModalOpen(false);
    
    const emptyForm = { name: '', phone: '', address: '' };
    setCheckoutForm(emptyForm);
    checkoutFormRef.current = emptyForm;
    
    triggerUISound('success');
    
    invoice.items.forEach(item => { 
        setStockLogs(prev => [{ id: Math.random().toString(36), date: invoice.date, productName: item.name, change: -item.cartQty, reason: `Bán lẻ - ${invoice.id}` }, ...prev]); 
    });
  };

  const handleDownloadPDF = async () => {
    if (!currentInvoice) return; 
    triggerUISound('click');
    const element = document.getElementById('invoice-receipt'); 
    if (!element) return;
    
    // Sử dụng setTimeout để đảm bảo UI đã cập nhật trước khi chụp ảnh, tránh treo UI
    setTimeout(async () => {
        try {
            const canvas = await html2canvas(element, { 
                scale: 2, // Giảm scale từ 3 xuống 2 để giảm tải bộ nhớ
                backgroundColor: '#ffffff', 
                useCORS: true,
                logging: false // Tắt logging để tránh spam console gây chậm
            });
            const format = currentInvoice.isWholesale ? 'a4' : 'a5';
            const pdf = new jsPDF('p', 'mm', format);
            const pdfWidth = pdf.internal.pageSize.getWidth(); 
            const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
            
            const x = 0; 
            const y = 0;
            
            pdf.addImage(canvas.toDataURL('image/png'), 'PNG', x, y, pdfWidth, pdfHeight);
            pdf.save(`HoaDon-${currentInvoice.id}.pdf`);
        } catch (error) {
            console.error("PDF Gen Error", error);
            addLog("Lỗi in hóa đơn: " + error, 'error');
        }
    }, 100);
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return; triggerUISound('click');
    const isTextBased = file.type === "text/csv" || file.name.endsWith('.csv') || file.type === "text/plain" || file.name.endsWith('.txt') || file.name.endsWith('.json');
    if (isTextBased) {
        const reader = new FileReader();
        reader.onload = (ev) => {
            const text = ev.target?.result as string;
            const lines = text.split('\n');
             lines.forEach(line => { const parts = line.split(/[;,|\t]/); if (parts.length >= 2) importStock(parts[0].trim(), parseInt(parts[1].trim())); });
            addLog(t.logs.fileProcessed, 'success');
        };
        reader.readAsText(file); return;
    }
    if (status === SessionStatus.CONNECTED && activeSessionRef.current) {
        const base64 = await blobToBase64(file); let mimeType = file.type;
        if (file.name.endsWith('.pdf')) mimeType = 'application/pdf'; if (file.name.endsWith('.jpg')) mimeType = 'image/jpeg';
        try {
            activeSessionRef.current.sendRealtimeInput({ media: { data: base64, mimeType } });
            activeSessionRef.current.sendRealtimeInput({ text: "Phân tích tài liệu này để nhập hàng." });
            addLog(t.logs.fileSent, 'api');
        } catch (e) { addLog(t.logs.errorSending, 'error'); }
    }
  };

  const checkConnection = async () => {
    if (!esp32Ip) { addLog('Vui lòng nhập IP trước khi kiểm tra.', 'warning'); return; }
    setIsCheckingCam(true); setCamCheckStatus('idle'); addLog(`Checking connection to: ${esp32Ip}`, 'info');
    let url = esp32Ip.startsWith('http') ? esp32Ip : `http://${esp32Ip}`;
    
    if (useRemoteMic) {
        const wsUrl = url.replace('http', 'ws') + ':81';
        addLog(`Connecting socket: ${wsUrl}`, 'info');
        const ws = new WebSocket(wsUrl);
        ws.onopen = () => { setCamCheckStatus('success'); addLog(t.logs.micConnected, 'success'); triggerUISound('success'); setIsCheckingCam(false); ws.close(); };
        ws.onerror = () => { setCamCheckStatus('error'); addLog(t.logs.socketError, 'error'); setIsCheckingCam(false); };
        return;
    }

    if (isSensorMode) {
         const testUrl = `${url}/status`;
         try {
             const controller = new AbortController(); setTimeout(() => controller.abort(), 3000);
             const res = await fetch(testUrl, { signal: controller.signal });
             if (res.ok) { setCamCheckStatus('success'); addLog('Sensor Connected!', 'success'); triggerUISound('success'); } else { throw new Error("HTTP Error"); }
         } catch(e) { setCamCheckStatus('error'); addLog(t.logs.sensorFail, 'error'); triggerUISound('click'); }
         setIsCheckingCam(false); return;
    }

    if (!url.includes('/capture') && !url.includes(':81')) { url = `${url}/capture`; }
    const testUrl = `${url}${url.includes('?') ? '&' : '?'}t=${Date.now()}`;
    const img = new Image();
    img.onload = () => { setIsCheckingCam(false); setCamCheckStatus('success'); triggerUISound('success'); addLog(t.logs.cameraConnected, 'success'); };
    img.onerror = () => { setIsCheckingCam(false); setCamCheckStatus('error'); triggerUISound('click'); addLog(t.logs.cameraError, 'error'); };
    setTimeout(() => { if (img.complete) return; img.src = ""; if (isCheckingCam) { setIsCheckingCam(false); setCamCheckStatus('error'); addLog(t.logs.timeout, 'error'); } }, 5000);
    img.src = testUrl;
  };

  // --- AI TOOLS & CORE LOGIC (EXISTING) ---
  const registerCustomerTool: FunctionDeclaration = { name: 'registerCustomer', description: 'Lưu thông tin khách hàng.', parameters: { type: Type.OBJECT, properties: { name: { type: Type.STRING }, phone: { type: Type.STRING }, address: { type: Type.STRING }, notes: { type: Type.STRING } }, required: ['name', 'phone', 'address'] } };
  const lookupCustomerTool: FunctionDeclaration = { name: 'lookupCustomer', description: 'Tra cứu khách hàng.', parameters: { type: Type.OBJECT, properties: { query: { type: Type.STRING } }, required: ['query'] } };
  const createPreOrderTool: FunctionDeclaration = { name: 'createPreOrder', description: 'Tạo đơn đặt hàng.', parameters: { type: Type.OBJECT, properties: { phone: { type: Type.STRING }, productRequest: { type: Type.STRING }, quantity: { type: Type.NUMBER } }, required: ['phone', 'productRequest', 'quantity'] } };
  const createInvoiceTool: FunctionDeclaration = { name: 'createInvoice', description: 'Tạo hóa đơn.', parameters: { type: Type.OBJECT, properties: { items: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { productName: { type: Type.STRING }, quantity: { type: Type.NUMBER } }, required: ['productName', 'quantity'] } } }, required: ['items'] } };
  const importStockTool: FunctionDeclaration = { name: 'importStock', description: 'Nhập kho.', parameters: { type: Type.OBJECT, properties: { items: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { productName: { type: Type.STRING }, quantity: { type: Type.NUMBER } }, required: ['productName', 'quantity'] } } }, required: ['items'] } };
  const checkStockTool: FunctionDeclaration = { name: 'checkStock', description: 'Kiểm tra kho.', parameters: { type: Type.OBJECT, properties: { productName: { type: Type.STRING } }, required: ['productName'] } };

  const disconnectFromAI = useCallback(() => {
    intentionalDisconnectRef.current = true;
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    triggerUISound('click');
    if (activeSessionRef.current) { try { activeSessionRef.current.close(); } catch(e){} activeSessionRef.current = null; }
    if (audioContextRef.current) { try { audioContextRef.current.close(); } catch(e){} audioContextRef.current = null; }
    if (outputAudioContextRef.current) { try { outputAudioContextRef.current.close(); } catch(e){} outputAudioContextRef.current = null; }
    if (wsRef.current) { wsRef.current.close(); wsRef.current = null; }
    
    sessionPromiseRef.current = null;
    setStatus(SessionStatus.IDLE);
    setIsUserSpeaking(false);
    setIsAISpeaking(false);
    checkoutPhaseRef.current = 'idle';
    
    setTranscriptions([]);
    localStorage.removeItem(getStorageKey('gemini_chat_history', user?.email));
    localStorage.removeItem(getStorageKey('gemini_last_active_ts', user?.email));
    addLog(t.logs.disconnected, 'info');
  }, [triggerUISound, addLog, t, user?.email]);

  const connectToAI = async () => {
    if (showLoginModal || showPaywall) return;
    
    // Check Limits BEFORE connecting
    const { blocked, reason } = checkLimits();
    if (blocked) {
        setShowPaywall(true);
        setIsForcedLock(true);
        addLog(reason || 'Trial limit reached.', 'warning');
        return;
    }

    if (status === SessionStatus.CONNECTED) { disconnectFromAI(); return; }
    triggerUISound('click');
    setPermissionError(null);
    intentionalDisconnectRef.current = false;
    if (status === SessionStatus.CONNECTING) return;

    // Ưu tiên đọc API key từ biến môi trường Vite (file .env.local)
    const envApiKey = (import.meta as any).env?.VITE_GEMINI_API_KEY as string | undefined;
    let apiKey = envApiKey || process.env.API_KEY || (keyPool.length > 0 ? keyPool[activeKeyIndex] : null);
    if (!apiKey) { addLog('Missing API Key', 'error'); setStatus(SessionStatus.ERROR); return; }

    setStatus(SessionStatus.CONNECTING);
    addLog(t.logs.initializing, 'info');
    
    // 1. Initialize AudioContext with preferred rate
    // Try to get 16000 directly to avoid resampling if possible
    audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
    outputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });

    const ai = new GoogleGenAI({ apiKey: apiKey });
    const inventoryJson = JSON.stringify(inventory.map(p => ({ name: p.name, qty: p.quantity, price: p.price })));
    const roleInstruction = userRole === 'STAFF' 
      ? `NGƯỜI DÙNG LÀ QUẢN LÝ (MANAGER).`
      : `NGƯỜI DÙNG LÀ KHÁCH HÀNG (CUSTOMER).`;

    const systemInstruction = `
      VAI TRÒ: Bạn là nhân viên bán hàng chuyên nghiệp tại "${storeName}".
      PHONG CÁCH:
      1. GIỌNG NÓI: To, rõ, tự tin, hào hứng.
      2. THÁI ĐỘ: Luôn chủ động. TUYỆT ĐỐI KHÔNG than phiền 'quán ồn'.
      3. QUY TẮC CẤM KỴ (QUAN TRỌNG):
         - Tuyệt đối KHÔNG nói tên hàm kỹ thuật.
         - Khi cần tra cứu, hãy âm thầm thực hiện.
      4. QUY TẮC CHỐT ĐƠN (QUAN TRỌNG):
         - Khi khách đã chọn sản phẩm và nói 'lấy luôn', 'xuất hóa đơn', 'chốt đơn': có thể hỏi TỐI ĐA MỘT LẦN 'Anh/chị có muốn lấy thêm sản phẩm nào nữa không ạ?'. Nếu khách trả lời: không / không ạ / không cần / với không / vậy thôi / đủ rồi / thế thôi / xuất hóa đơn nhé / chốt đi / không lấy thêm — thì COI NHƯ ĐÃ CHỐT ĐƠN. TUYỆT ĐỐI KHÔNG hỏi lại 'có muốn lấy thêm không' lần hai; chuyển NGAY sang xin Tên, Số điện thoại và Địa chỉ để xuất hóa đơn.
         - Nếu khách nói muốn thêm, hãy tư vấn thêm; khi khách nói đủ rồi hoặc xuất hóa đơn thì áp dụng quy tắc trên (chỉ hỏi thêm tối đa một lần, nếu họ từ chối thì không hỏi nữa).
         - Trước khi gọi hàm tạo hóa đơn, BẮT BUỘC phải hỏi và ghi nhận đủ Tên, Số điện thoại và Địa chỉ của khách hàng.
         - Sau khi đã có đủ Tên, SĐT và Địa chỉ: đọc lại toàn bộ thông tin cho khách (ví dụ: 'Em xác nhận lại: anh/chị [tên], số điện thoại [số], địa chỉ [địa chỉ]. Thông tin đúng chưa ạ?') và chỉ khi khách xác nhận đúng mới gọi registerCustomer rồi createInvoice; nếu khách sửa thì cập nhật và đọc lại xác nhận lần nữa.
         - Trong lúc hệ thống xử lý hóa đơn, có thể nói: 'Dạ anh/chị chờ em một chút, em đang xuất hóa đơn ạ'.
         - Sau khi hóa đơn đã tạo xong, nói: 'Em đã xuất hóa đơn và gửi cho anh/chị rồi, anh/chị kiểm tra giúp em nhé. Nếu cần mua thêm hay cần em tư vấn gì thêm thì cứ nói em ạ.'.

      CHẾ ĐỘ: ${roleInstruction}
      DỮ LIỆU KHO: ${inventoryJson}
      THÔNG TIN KHUYẾN MÃI: ${storeDocs}
    `;

    let restorationPrompt: string | null = null;
    const lastActive = localStorage.getItem(getStorageKey('gemini_last_active_ts', user?.email));
    const hasHistory = transcriptions.length > 0;
    if (hasHistory && lastActive && (Date.now() - parseInt(lastActive)) < 15 * 60 * 1000) {
        const historySlice = transcriptions.slice(-3);
        const historyText = historySlice.map(t => `${t.isUser ? 'Khách' : 'Bạn'}: ${t.text}`).join(' | ');
        restorationPrompt = `(HỆ THỐNG: Kết nối vừa bị gián đoạn. Đừng chào lại từ đầu. Hãy tiếp tục cuộc hội thoại hiện tại, giữ đúng vai trò nhân viên bán hàng tại "${storeName}".\nLỊCH SỬ GẦN ĐÂY:\n${historyText}\n)`;
        addLog(`${t.logs.restoring} (${historySlice.length} turns)`, 'warning');
    }

    try {
      let stream: MediaStream | null = null;
      
      const handleSilenceTrigger = () => {
         if (!activeSessionRef.current || intentionalDisconnectRef.current || isUserSpeaking) return;

         // Nếu đang trong giai đoạn chốt đơn / xuất hóa đơn thì KHÔNG gợi ý sản phẩm mới
         if (checkoutPhaseRef.current === 'checkout') {
             addLog('Silence trigger in CHECKOUT phase', 'api');
             activeSessionRef.current.sendRealtimeInput({
                 text: "(Hệ thống: Đang xử lý hóa đơn cho khách. Đừng chào lại từ đầu, đừng giới thiệu sản phẩm mới. Hãy trấn an khách rằng hóa đơn đang được xử lý và mời khách kiểm tra hóa đơn khi đã xong.)"
             });
             return;
         }

         // Trường hợp bình thường: có thể gợi ý sản phẩm khi khách im lặng
         addLog('Silence trigger in NORMAL phase', 'api');
         activeSessionRef.current.sendRealtimeInput({
             text: "(Hệ thống: Khách im lặng. Nếu chưa rõ ý, hãy tự tin gợi ý sản phẩm bán chạy.)"
         });
      };

      const resetSilenceTimer = () => {
         if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
         if (!intentionalDisconnectRef.current) {
             silenceTimerRef.current = window.setTimeout(handleSilenceTrigger, PROACTIVE_SILENCE_TIMEOUT);
         }
      };

      const tools: Tool[] = [{ functionDeclarations: [createInvoiceTool, checkStockTool, importStockTool, registerCustomerTool, lookupCustomerTool, createPreOrderTool] }];
      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-12-2025',
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } },
          systemInstruction,
          tools,
          inputAudioTranscription: {},
          outputAudioTranscription: {},
        },
        callbacks: {
          onopen: async () => {
            setStatus(SessionStatus.CONNECTED);
            retryCountRef.current = 0;
            triggerUISound('success');
            addLog(t.logs.connected, 'success');
            
            if (useRemoteMic && esp32Ip) {
                // ... (External Mic logic remains same) ...
                const wsUrl = (esp32Ip.startsWith('http') ? esp32Ip.replace('http', 'ws') : `ws://${esp32Ip}`) + ':81';
                wsRef.current = new WebSocket(wsUrl);
                wsRef.current.binaryType = 'arraybuffer';
                wsRef.current.onopen = () => { addLog(t.logs.micConnected, 'success'); };
                wsRef.current.onmessage = async (event) => {
                    if (event.data instanceof ArrayBuffer && activeSessionRef.current) {
                        const data = new Uint8Array(event.data);
                        let sum = 0; const int16 = new Int16Array(event.data); for(let i=0; i<int16.length; i+=10) sum += Math.abs(int16[i]); const avg = sum / (int16.length/10);
                        if (avg > 800) { 
                             if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
                             setIsUserSpeaking(true);
                             if (speakingTimeoutRef.current) window.clearTimeout(speakingTimeoutRef.current);
                             speakingTimeoutRef.current = window.setTimeout(() => { setIsUserSpeaking(false); resetSilenceTimer(); }, 1000);
                             activeSessionRef.current.sendRealtimeInput({ media: { data: encode(data), mimeType: 'audio/pcm;rate=16000' } });
                        }
                    }
                };
            } else {
                if (!audioContextRef.current) return;
                try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } }); } catch(e) { throw new Error("Lỗi Micro Điện Thoại"); }
                
                const ctx = audioContextRef.current;
                const source = ctx.createMediaStreamSource(stream);
                const compressor = ctx.createDynamicsCompressor(); 
                compressor.threshold.value = -20; 
                compressor.knee.value = 40; 
                compressor.ratio.value = 12;
                compressor.attack.value = 0;
                compressor.release.value = 0.25;

                const scriptProcessor = ctx.createScriptProcessor(4096, 1, 1);
                const silenceNode = ctx.createGain();
                silenceNode.gain.value = 0;

                source.connect(compressor);
                compressor.connect(scriptProcessor); 
                scriptProcessor.connect(silenceNode);
                silenceNode.connect(ctx.destination);
                
                const currentSampleRate = ctx.sampleRate;

                scriptProcessor.onaudioprocess = (e) => {
                  if (!activeSessionRef.current) return;
                  const inputData = e.inputBuffer.getChannelData(0);
                  const pcm16 = downsampleTo16k(inputData, currentSampleRate);
                  let sum = 0;
                  const step = 4; 
                  for(let i=0; i<pcm16.length; i+=step) sum += Math.abs(pcm16[i]); 
                  const avgAmp = sum / (pcm16.length / step);
                  const normalizedAmp = avgAmp / 32768.0;

                  if (normalizedAmp < noiseFloorRef.current) { 
                      noiseFloorRef.current = noiseFloorRef.current * 0.95 + normalizedAmp * 0.05; 
                  } else {
                      noiseFloorRef.current = noiseFloorRef.current * 0.995 + normalizedAmp * 0.005;
                  }
                  
                  const speechThreshold = Math.max(noiseFloorRef.current * 1.5, 0.005); 
                  
                  if (normalizedAmp > speechThreshold && !isMuted) {
                    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current); 
                    setIsUserSpeaking(true);
                    
                    if (speakingTimeoutRef.current) window.clearTimeout(speakingTimeoutRef.current);
                    speakingTimeoutRef.current = window.setTimeout(() => { 
                        setIsUserSpeaking(false); 
                        resetSilenceTimer(); 
                    }, 800); 
                    
                    activeSessionRef.current.sendRealtimeInput({ media: { data: encode(new Uint8Array(pcm16.buffer)), mimeType: 'audio/pcm;rate=16000' } });
                  }
                };
            }

            sessionPromise.then(session => {
                if (restorationPrompt) session.sendRealtimeInput({ text: restorationPrompt });
                else { const prompt = t.systemPrompt.replace('[Store Name]', storeName); session.sendRealtimeInput({ text: prompt }); }
                resetSilenceTimer();
            });
          },
          onmessage: async (message: LiveServerMessage) => {
            const base64Audio = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
            if (base64Audio) {
              if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
              setIsAISpeaking(true);
              const ctx = outputAudioContextRef.current!;
              nextStartTimeRef.current = Math.max(nextStartTimeRef.current, ctx.currentTime);
              const audioBuffer = await decodeAudioData(decode(base64Audio), ctx, 24000, 1);
              const source = ctx.createBufferSource();
              source.buffer = audioBuffer;
              source.connect(ctx.destination);
              source.start(nextStartTimeRef.current);
              nextStartTimeRef.current += audioBuffer.duration;
              sourcesRef.current.add(source);
              source.onended = () => { sourcesRef.current.delete(source); if (sourcesRef.current.size === 0) { setIsAISpeaking(false); resetSilenceTimer(); } };
            }
            if (message.serverContent?.interrupted) { 
              addLog('Audio interrupted by server (user barge-in detected).', 'info');
              sourcesRef.current.forEach(s => { try { s.stop(); } catch (e) {} }); 
              sourcesRef.current.clear(); 
              nextStartTimeRef.current = 0; 
              setIsAISpeaking(false); 
              if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current); 
            }
            if (message.toolCall) {
              for (const fc of message.toolCall.functionCalls) {
                addLog(`${t.logs.toolCalled}${fc.name}`, 'info');
                let result: any = { status: 'ok' }; const args = fc.args as any;
                
                if (fc.name === 'createInvoice') { 
                    // CRITICAL: Check if customer info exists before creating
                    if (!checkoutFormRef.current.name || !checkoutFormRef.current.phone || !checkoutFormRef.current.address) {
                        result = { status: 'error', message: 'Hệ thống: Vui lòng hỏi Tên, Số điện thoại và Địa chỉ khách hàng trước khi tạo hóa đơn.' };
                    } else {
                        const items = args.items || []; 
                        const resolvedItems: CartItem[] = [];
                        
                        items.forEach((item: any) => { 
                            const product = inventoryRef.current.find(p => p.name.toLowerCase().includes(item.productName.toLowerCase())); 
                            if (product) { 
                                resolvedItems.push({ ...product, cartQty: item.quantity });
                            } 
                        });
                        
                        if (resolvedItems.length > 0) {
                            checkoutPhaseRef.current = 'checkout';
                            handleConfirmCheckout(resolvedItems); 
                            checkoutPhaseRef.current = 'idle';
                            result = { 
                              message: 'Hóa đơn đã được tạo và file đã sẵn sàng cho khách tải/xem. Từ bây giờ, hãy mời khách kiểm tra hóa đơn, hỏi lịch sự xem còn muốn mua thêm hay cần tư vấn gì nữa không. Nếu khách không cần gì thêm thì hãy chào tạm biệt và hẹn gặp lại.' 
                            }; 
                        } else {
                            result = { message: 'Không tìm thấy sản phẩm trong kho.' };
                        }
                    }
                }
                else if (fc.name === 'importStock') { if (userRole !== 'STAFF') result = { error: 'Access Denied' }; else { args.items.forEach((i:any) => importStock(i.productName, i.quantity)); result = { message: 'Imported' }; } }
                else if (fc.name === 'checkStock') { const product = inventoryRef.current.find(p => p.name.toLowerCase().includes(args.productName.toLowerCase())); result = product ? { ...product } : { error: 'Not found', stock: 0 }; }
                else if (fc.name === 'registerCustomer') { 
                    // Sync to checkout form via Ref and State
                    const updatedForm = { ...checkoutFormRef.current, name: args.name, phone: args.phone, address: args.address || checkoutFormRef.current.address };
                    setCheckoutForm(updatedForm);
                    checkoutFormRef.current = updatedForm; // Update ref immediately for subsequent calls

                    const customer = handleRegisterCustomer(args.name, args.phone, args.address, args.notes); 
                    checkoutPhaseRef.current = 'checkout';
                    result = { 
                      message: `Đã lưu thông tin khách hàng: ${customer.name}. NGAY BÂY GIỜ, hãy nói rõ với khách: "Em đã ghi nhận đầy đủ thông tin và đang xuất hóa đơn, anh/chị vui lòng chờ em một chút ạ." Trong lúc hệ thống xử lý, nếu khách hỏi thêm hoặc thúc giục thì hãy ưu tiên trấn an, giải thích ngắn gọn và tiếp tục hỗ trợ khách, không được im lặng quá lâu.`, 
                      customerId: customer.id 
                    }; 
                    setSidebarTab('crm'); 
                }
                else if (fc.name === 'lookupCustomer') { const found = customersRef.current.find(c => c.phone.includes(args.query) || c.name.toLowerCase().includes(args.query.toLowerCase())); result = found ? { found: true, customer: found } : { found: false }; setSidebarTab('crm'); }
                else if (fc.name === 'createPreOrder') { result = { message: handleCreatePreOrder(args.phone, args.productRequest, args.quantity) }; }
                
                // Log tool result (truncated) for easier debugging
                try {
                  const preview = JSON.stringify(result).slice(0, 200);
                  addLog(`${t.logs.toolResult}${fc.name}: ${preview}${preview.length === 200 ? '…' : ''}`, 'api');
                } catch {
                  addLog(`${t.logs.toolResult}${fc.name}: [unserializable result]`, 'api');
                }

                sessionPromise.then(session => session.sendToolResponse({ functionResponses: { id: fc.id, name: fc.name, response: { result } } }));
              }
            }
            const content = message.serverContent;
            if (content) {
                if (content.inputTranscription?.text) transcriptionBufferRef.current.user += content.inputTranscription.text;
                if (content.outputTranscription?.text) transcriptionBufferRef.current.model += content.outputTranscription.text;
                if (content.turnComplete) {
                     const finalUser = transcriptionBufferRef.current.user.trim();
                     const finalModel = transcriptionBufferRef.current.model.trim();
                     if (finalUser) setTranscriptions(prev => [...prev.slice(-19), { text: finalUser, isUser: true, timestamp: Date.now() }]);
                     if (finalModel) setTranscriptions(prev => [...prev.slice(-19), { text: finalModel, isUser: false, timestamp: Date.now() + 1 }]);
                     transcriptionBufferRef.current = { user: '', model: '' };
                }
            }
          },
          onerror: (e: any) => { addLog(`Network Error: ${e?.message}`, 'warning'); },
          onclose: () => {
             if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
             if (!intentionalDisconnectRef.current) {
                 // Exponential backoff reconnect
                 const retryDelay = Math.min(2000 * Math.pow(1.5, retryCountRef.current), 15000); 
                 if (retryCountRef.current < 10) { 
                     setStatus(SessionStatus.CONNECTING); 
                     retryCountRef.current += 1; 
                     addLog(`Connection lost. Retrying in ${retryDelay/1000}s...`, 'warning');
                     setTimeout(() => connectToAI(), retryDelay); 
                 } else { 
                     setStatus(SessionStatus.IDLE); 
                     addLog("Connection failed after multiple attempts.", 'error');
                 }
             } else { setStatus(SessionStatus.IDLE); setIsUserSpeaking(false); setIsAISpeaking(false); activeSessionRef.current = null; }
          }
        }
      });
      sessionPromiseRef.current = sessionPromise;
      activeSessionRef.current = await sessionPromise;
    } catch (err: any) { addLog(err.message, 'error'); setPermissionError(err.message); setStatus(SessionStatus.ERROR); }
  };

  const handleFrame = useCallback((base64: string) => {
    if (useRemoteMic || isVoiceOnly) return; 
    if (status === SessionStatus.CONNECTED && activeSessionRef.current) {
      activeSessionRef.current.sendRealtimeInput({ media: { data: base64, mimeType: 'image/jpeg' } });
    }
  }, [isVoiceOnly, useRemoteMic, status]);

  const handleManualClearHistory = () => {
      triggerUISound('click');
      if (window.confirm(t.confirmClearHistory)) {
          setTranscriptions([]);
          localStorage.removeItem(getStorageKey('gemini_chat_history', user?.email));
          localStorage.removeItem(getStorageKey('gemini_last_active_ts', user?.email));
          addLog('Deleted history.', 'info');
      }
  };

  // --- UI RENDER HELPERS ---
  const renderCRMTab = () => (
      <div className="space-y-6 animate-[fadeIn_0.3s_ease-out] pb-20">
          <h3 className="text-orange-500 font-bold uppercase text-xs tracking-wider mb-2">{t.crmTitle}</h3>
          <input type="text" placeholder={t.searchCrm} value={crmSearch} onChange={(e) => setCrmSearch(e.target.value)} className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500" />
          <div className="space-y-4">
              <div className="flex justify-between items-center border-b border-white/5 pb-2"><span className="text-[10px] font-bold text-slate-500 uppercase">{t.orderList}</span><span className="text-[10px] bg-red-900/50 text-red-400 px-2 py-0.5 rounded-full">{preOrders.filter(p => p.status === 'PENDING').length} {t.wait}</span></div>
              <div className="space-y-2 max-h-40 overflow-y-auto scrollbar-hide">
                  {preOrders.filter(p => p.customerName.toLowerCase().includes(crmSearch.toLowerCase()) || p.customerPhone.includes(crmSearch)).map(po => (
                      <div key={po.id} className="bg-red-900/10 border border-red-500/20 rounded-lg p-3 relative">
                          <div className="flex justify-between items-start mb-1"><span className="text-xs font-bold text-white">{po.productRequest} <span className="text-red-400">x{po.quantity}</span></span><span className="text-[9px] px-1.5 py-0.5 rounded bg-red-500/20 text-red-300">{po.status}</span></div>
                          <div className="text-[10px] text-slate-400">{t.customer}: {po.customerName} ({po.customerPhone})</div>
                      </div>
                  ))}
              </div>
          </div>
          <div className="space-y-4 pt-4 border-t border-white/10"><span className="text-[10px] font-bold text-slate-500 uppercase">{t.customerList}</span>
              <div className="space-y-2">
                  {customers.filter(c => c.name.toLowerCase().includes(crmSearch.toLowerCase()) || c.phone.includes(crmSearch)).map(cus => (
                      <div key={cus.id} className="bg-slate-800/50 border border-slate-700 rounded-lg p-3"><div className="text-xs font-bold text-indigo-300">{cus.name}</div><div className="text-[10px] text-slate-400 font-mono">{cus.phone}</div></div>
                  ))}
              </div>
          </div>
      </div>
  );

  const renderInventoryTab = () => (
      <div className="space-y-6 animate-[fadeIn_0.3s_ease-out] pb-20">
          <div className="flex justify-between items-center mb-4">
             <div className="flex items-center gap-2">
               <h3 className="text-orange-500 font-bold uppercase text-xs tracking-wider">{t.productList}</h3>
               {inventory.length > 0 && (
                 <button
                   onClick={handleClearInventory}
                   className="text-[9px] font-bold uppercase px-2 py-1 rounded bg-red-600/20 text-red-300 hover:bg-red-600/40 hover:text-white transition-colors"
                 >
                   XÓA TẤT CẢ
                 </button>
               )}
             </div>
             <div className="flex gap-1 bg-slate-800 p-1 rounded-lg">
                 {(['POS', 'IMPORT', 'CHECK'] as const).map(m => (
                     <button key={m} onClick={() => setInventoryMode(m)} className={`px-3 py-1 text-[9px] font-bold rounded-md transition-all ${inventoryMode === m ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}>{m}</button>
                 ))}
             </div>
          </div>
          
          {cart.length > 0 && (
              <div className="bg-slate-800/50 border border-indigo-500/30 rounded-xl p-4 mb-6 relative overflow-hidden group">
                  <div className="absolute top-0 left-0 w-1 h-full bg-indigo-500"></div>
                  <div className="flex justify-between items-end mb-4 border-b border-white/5 pb-2">
                      <div><span className="text-xs font-bold text-white uppercase tracking-wider">{t.cartTitle}</span><span className="text-[10px] text-indigo-400 ml-2 font-mono">({cart.length} {t.items})</span></div>
                      <button onClick={() => setCart([])} className="text-[9px] text-red-400 hover:text-red-300 uppercase font-bold px-2 py-1 rounded hover:bg-red-500/10 transition-colors">{t.clearCart}</button>
                  </div>
                  <div className="space-y-2 max-h-40 overflow-y-auto scrollbar-hide">
                      {cart.map(item => (
                          <div key={item.id} className="flex justify-between items-center text-xs group/item hover:bg-white/5 p-2 rounded-lg transition-colors">
                              <div className="flex-1"><div className="font-bold text-slate-200">{item.name}</div><div className="text-[10px] text-slate-500">{item.price.toLocaleString()} x {item.cartQty}</div></div>
                              <div className="flex items-center gap-3">
                                  <span className="font-mono font-bold text-indigo-300">{(item.price * item.cartQty).toLocaleString()}</span>
                                  <button onClick={() => removeFromCart(item.id)} className="text-red-500 hover:text-red-400 opacity-0 group-hover/item:opacity-100 transition-opacity">×</button>
                              </div>
                          </div>
                      ))}
                  </div>
                  <div className="pt-4 mt-2 border-t border-white/10 flex justify-between items-end">
                      <div><div className="text-[9px] text-slate-500 uppercase font-bold">{t.total}</div><div className="text-xl font-black text-white">{cart.reduce((s, i) => s + i.price * i.cartQty, 0).toLocaleString()} <span className="text-[10px] text-slate-500 font-normal">VND</span></div></div>
                      <button onClick={handleOpenCheckout} className="bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-2 rounded-lg text-xs font-bold uppercase shadow-lg shadow-indigo-600/20 transition-all hover:scale-105 active:scale-95">{t.pay} ➔</button>
                  </div>
              </div>
          )}

          <div className="grid grid-cols-2 gap-2">
             <label className="flex flex-col items-center justify-center p-3 border-2 border-dashed border-slate-700 hover:border-indigo-500/50 rounded-xl cursor-pointer bg-slate-800/30 hover:bg-slate-800 transition-all group">
                 <input type="file" className="hidden" accept=".csv,.txt,.json" onChange={handleCatalogUpload} ref={catalogInputRef} />
                 <span className="text-xl mb-1 group-hover:scale-110 transition-transform">📄</span>
                 <span className="text-[9px] font-bold text-slate-400 uppercase">{t.uploadCatalog}</span>
             </label>
             <label className="flex flex-col items-center justify-center p-3 border-2 border-dashed border-slate-700 hover:border-indigo-500/50 rounded-xl cursor-pointer bg-slate-800/30 hover:bg-slate-800 transition-all group">
                 <input type="file" className="hidden" accept=".pdf,.jpg,.png,.csv" onChange={handleImportFile} ref={importFileInputRef} />
                 <span className="text-xl mb-1 group-hover:scale-110 transition-transform">📎</span>
                 <span className="text-[9px] font-bold text-slate-400 uppercase">{t.importFile}</span>
             </label>
          </div>

          <div className="space-y-2">
              <input type="text" placeholder="Tìm sản phẩm..." className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500 mb-2" onChange={(e) => { /* Implement local filter if needed */ }} />
              {inventory.slice(0, 50).map(p => (
                  <div key={p.id} onClick={() => { if(inventoryMode === 'POS') addToCart(p); else if (inventoryMode === 'IMPORT') importStock(p.name, 1); }} className="flex justify-between items-center p-3 bg-slate-800/50 border border-slate-700 hover:border-indigo-500/50 rounded-lg cursor-pointer transition-colors group">
                      <div>
                          <div className="text-xs font-bold text-slate-200 group-hover:text-indigo-300 transition-colors">{p.name}</div>
                          <div className="text-[10px] text-slate-500">{p.price.toLocaleString()} • Tồn: {p.quantity}</div>
                      </div>
                      <button className={`w-6 h-6 rounded flex items-center justify-center text-xs font-bold transition-colors ${inventoryMode === 'POS' ? 'bg-indigo-600/20 text-indigo-400 group-hover:bg-indigo-600 group-hover:text-white' : 'bg-emerald-600/20 text-emerald-400 group-hover:bg-emerald-600 group-hover:text-white'}`}>+</button>
                  </div>
              ))}
          </div>
      </div>
  );

  const renderSettingsTab = () => (
      <div className="space-y-8 animate-[fadeIn_0.3s_ease-out] pb-20">
          {user && (
          <div className="space-y-4">
              <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest border-b border-white/5 pb-2">Tài khoản</h3>
              <div className="flex justify-between items-center bg-slate-800/50 p-4 rounded-xl border border-slate-700">
                  <div className="text-xs text-slate-400 truncate flex-1 mr-2">{user.email}</div>
                  <button onClick={handleLogout} className="px-4 py-2 bg-red-600/20 hover:bg-red-600/40 border border-red-500/50 text-red-400 rounded-lg text-xs font-bold uppercase transition-colors">Đăng xuất</button>
              </div>
          </div>
          )}
          <div className="space-y-4">
              <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest border-b border-white/5 pb-2">{t.subscription}</h3>
              <div className="flex justify-between items-center bg-gradient-to-r from-slate-800 to-slate-900 p-4 rounded-xl border border-white/10">
                  <div>
                      <div className="text-xs text-slate-400 mb-1">{t.subscription}</div>
                      <div className="text-lg font-black text-white flex items-center gap-2">
                          {user?.isPremium ? <span className="text-indigo-400">✨ {t.planPremium}</span> : <span className="text-slate-400">{t.planFree}</span>}
                      </div>
                      {user && !user.isPremium && (
                          <div className="text-[10px] text-orange-400 mt-1">
                              {t.limitReached}: {dailyMinutesUsed}/{DAILY_LIMIT_MINUTES}m
                          </div>
                      )}
                  </div>
                  <button 
                      onClick={() => setShowPaywall(true)} 
                      className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold uppercase shadow-lg shadow-indigo-600/20 transition-all active:scale-95"
                  >
                      {t.extendPlan}
                  </button>
              </div>
          </div>

          <div className="space-y-4">
              <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest border-b border-white/5 pb-2">{t.zaloConsult}</h3>
              <div className="flex flex-col items-center bg-gradient-to-r from-slate-800 to-slate-900 p-4 rounded-xl border border-white/10">
                  <p className="text-[10px] text-slate-400 mb-3 text-center">{t.zaloConsultDesc}</p>
                  <a href={`https://zalo.me/${ZALO_PHONE}`} target="_blank" rel="noopener noreferrer" className="flex flex-col items-center gap-2">
                      <img src={ZALO_QR_URL} alt="Zalo QR" className="w-32 h-32 rounded-lg bg-white p-1" />
                      <span className="text-sm font-bold text-emerald-400">{ZALO_PHONE}</span>
                  </a>
              </div>
          </div>

          <div className="space-y-4">
              <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest border-b border-white/5 pb-2">{t.apiConfig}</h3>
              <div className="flex gap-2">
                  <input type="password" value={newKeyInput} onChange={(e) => setNewKeyInput(e.target.value)} placeholder={t.enterApiKey} className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500 font-mono" />
                  <button onClick={() => { if(newKeyInput){ setKeyPool([...keyPool, newKeyInput]); setNewKeyInput(''); triggerUISound('success'); } }} className="px-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold transition-colors">{t.add}</button>
              </div>
              <div className="space-y-1">
                  {keyPool.map((k, i) => (
                      <div key={i} className="flex justify-between items-center bg-slate-800/50 px-3 py-2 rounded-lg text-[10px] font-mono border border-slate-700/50">
                          <span className="truncate max-w-[150px] text-slate-400">{k.slice(0, 8)}...{k.slice(-4)}</span>
                          <button onClick={() => setKeyPool(keyPool.filter((_, idx) => idx !== i))} className="text-red-500 hover:text-red-400 font-bold">{t.remove}</button>
                      </div>
                  ))}
              </div>
          </div>
          <div className="space-y-4">
              <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest border-b border-white/5 pb-2">{t.storeProfile}</h3>
              <div className="grid grid-cols-1 gap-3">
                  <input type="text" value={storeName} onChange={(e) => setStoreName(e.target.value)} placeholder={t.storeNamePlaceholder} className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500" />
                  <input type="text" value={storeHotline} onChange={(e) => setStoreHotline(e.target.value)} placeholder={t.hotlinePlaceholder} className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500" />
                  <input type="text" value={storeWebsite} onChange={(e) => setStoreWebsite(e.target.value)} placeholder={t.websitePlaceholder} className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500" />
                  <input type="text" value={storeAddress} onChange={(e) => setStoreAddress(e.target.value)} placeholder={t.addressPlaceholder} className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500" />
                  <textarea value={storeDocs} onChange={(e) => setStoreDocs(e.target.value)} placeholder={t.promotionPlaceholder} rows={4} className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500" />
              </div>
          </div>
          <div className="space-y-4">
              <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest border-b border-white/5 pb-2">{t.hardwareConnection}</h3>
              <div className="space-y-3">
                  <div className="flex gap-2">
                       <input type="text" value={esp32Ip} onChange={(e) => setEsp32Ip(e.target.value)} placeholder={t.esp32IpPlaceholder} className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500 font-mono" />
                       <button onClick={checkConnection} disabled={isCheckingCam} className={`px-3 rounded-lg text-[10px] font-bold uppercase transition-all ${camCheckStatus === 'success' ? 'bg-emerald-600 text-white' : camCheckStatus === 'error' ? 'bg-red-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}>{isCheckingCam ? '...' : camCheckStatus === 'success' ? 'OK' : camCheckStatus === 'error' ? 'FAIL' : t.test}</button>
                  </div>
                  <div className="flex flex-col gap-2">
                      <label className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg cursor-pointer hover:bg-slate-800 transition-colors">
                          <span className="text-xs font-bold text-slate-300">{t.remoteMic}</span>
                          <input type="checkbox" checked={useRemoteMic} onChange={(e) => setUseRemoteMic(e.target.checked)} className="accent-indigo-500 w-4 h-4" />
                      </label>
                      <label className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg cursor-pointer hover:bg-slate-800 transition-colors">
                          <span className="text-xs font-bold text-slate-300">{t.pirSensorMode}</span>
                          <input type="checkbox" checked={isSensorMode} onChange={(e) => setIsSensorMode(e.target.checked)} className="accent-indigo-500 w-4 h-4" />
                      </label>
                      <label className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg cursor-pointer hover:bg-slate-800 transition-colors">
                          <span className="text-xs font-bold text-slate-300">{t.voiceOnly}</span>
                          <input type="checkbox" checked={isVoiceOnly} onChange={(e) => setIsVoiceOnly(e.target.checked)} className="accent-indigo-500 w-4 h-4" />
                      </label>
                  </div>
              </div>
          </div>
          <div className="space-y-4">
              <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest border-b border-white/5 pb-2">{t.systemData}</h3>
              <div className="grid grid-cols-2 gap-3">
                  <button onClick={handleBackupDatabase} className="py-3 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg text-[10px] font-bold uppercase text-slate-300 transition-colors">{t.backupData}</button>
                  <label className="py-3 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg text-[10px] font-bold uppercase text-slate-300 transition-colors text-center cursor-pointer">
                      {t.restoreData}
                      <input type="file" className="hidden" accept=".json" onChange={handleRestoreDatabase} ref={databaseInputRef} />
                  </label>
              </div>
          </div>
      </div>
  );

  const renderLogsTab = () => (
      <div className="space-y-4 animate-[fadeIn_0.3s_ease-out] pb-20">
          <div className="flex justify-between items-center border-b border-white/5 pb-2">
              <h3 className="text-orange-500 font-bold uppercase text-xs tracking-wider">{t.systemLog}</h3>
              <button onClick={() => setLogs([])} className="text-[9px] text-red-400 hover:text-red-300 uppercase font-bold px-2 py-1 rounded hover:bg-red-500/10 transition-colors">{t.clear}</button>
          </div>
          <div className="space-y-2 max-h-[60vh] overflow-y-auto scrollbar-hide font-mono text-[10px]">
              {logs.length === 0 ? <div className="text-center text-slate-600 py-8 italic">No logs yet.</div> : logs.map(l => (
                  <div key={l.id} className={`p-2 rounded border ${l.type === 'error' ? 'bg-red-900/10 border-red-500/20 text-red-400' : l.type === 'warning' ? 'bg-orange-900/10 border-orange-500/20 text-orange-400' : l.type === 'api' ? 'bg-blue-900/10 border-blue-500/20 text-blue-400' : 'bg-slate-800/50 border-slate-700 text-slate-400'}`}>
                      <div className="flex justify-between mb-1 opacity-50"><span>{l.timestamp}</span><span className="uppercase font-bold">{l.type}</span></div>
                      <div className="break-all">{l.message}</div>
                  </div>
              ))}
          </div>
      </div>
  );

  const InvoiceContent = useMemo(() => {
    if (!currentInvoice) return null;
    if (currentInvoice.isWholesale) {
        return (
            <div id="invoice-receipt" className="p-8 bg-white text-black font-sans leading-relaxed w-[210mm] min-h-[297mm] mx-auto">
                <div className="flex justify-between items-start border-b-2 border-black pb-4 mb-6">
                    <div><h2 className="text-xl font-bold uppercase mb-1 text-slate-900">{storeName}</h2>{storeAddress && <p className="text-sm">{storeAddress}</p>}<p className="text-sm">{t.hotline}: {storeHotline} | {t.website}: {storeWebsite}</p></div>
                    <div className="text-right"><div className="border-2 border-red-600 text-red-600 font-bold px-4 py-2 text-sm inline-block rounded uppercase tracking-wider">Invoice No: {currentInvoice.id}</div><p className="text-sm mt-2 font-bold">{t.date}: {currentInvoice.date}</p></div>
                </div>
                <div className="text-center mb-8"><h1 className="text-3xl font-bold uppercase mb-2">{t.invoiceTitleA4}</h1><p className="italic text-sm text-gray-500">Sales Invoice</p></div>
                <div className="border border-gray-300 rounded p-4 mb-6 bg-gray-50"><div className="grid grid-cols-2 gap-4 text-sm"><div className="flex"><span className="font-bold w-24">{t.customer}:</span> <span>{currentInvoice.customerName}</span></div><div className="flex"><span className="font-bold w-24">{t.phone}:</span> <span>{currentInvoice.customerPhone}</span></div><div className="flex col-span-2"><span className="font-bold w-24">{t.addressLabel}:</span> <span>{currentInvoice.customerAddress}</span></div></div></div>
                <table className="w-full mb-6 border-collapse border border-black text-sm"><thead><tr className="bg-gray-200"><th className="border border-black py-2 px-2 w-12 text-black">No.</th><th className="border border-black py-2 px-2 text-left text-black">{t.item}</th><th className="border border-black py-2 px-2 w-16 text-center text-black">{t.unit}</th><th className="border border-black py-2 px-2 w-16 text-center text-black">{t.qty}</th><th className="border border-black py-2 px-2 w-32 text-right text-black">{t.price}</th><th className="border border-black py-2 px-2 w-32 text-right text-black">{t.amount}</th></tr></thead><tbody>{currentInvoice.items.map((item, idx) => (<tr key={idx}><td className="border border-black py-2 px-2 text-center text-black">{idx + 1}</td><td className="border border-black py-2 px-2 font-medium text-black">{item.name}</td><td className="border border-black py-2 px-2 text-center text-black">{item.unit}</td><td className="border border-black py-2 px-2 text-center text-black">{item.cartQty}</td><td className="border border-black py-2 px-2 text-right text-black">{item.price.toLocaleString('vi-VN')}</td><td className="border border-black py-2 px-2 text-right font-bold text-black">{(item.price * item.cartQty).toLocaleString('vi-VN')}</td></tr>))}</tbody></table>
                <div className="flex justify-end mb-6"><table className="text-sm w-1/2"><tbody><tr><td className="font-bold text-right py-1 px-4 text-black">{t.subtotal}:</td><td className="text-right py-1 w-32 font-medium text-black">{currentInvoice.subtotal.toLocaleString('vi-VN')}</td></tr><tr><td className="font-bold text-right py-1 px-4 text-black">{t.tax}:</td><td className="text-right py-1 w-32 font-medium text-black">{currentInvoice.tax.toLocaleString('vi-VN')}</td></tr><tr className="border-t-2 border-black text-lg"><td className="font-bold text-right py-2 px-4 uppercase text-black">{t.total}:</td><td className="text-right py-2 w-32 font-bold text-red-600">{currentInvoice.total.toLocaleString('vi-VN')}</td></tr></tbody></table></div>
                <div className="mb-12 text-sm italic border-t border-gray-300 pt-2 text-black"><span className="font-bold not-italic">Thành tiền bằng chữ: </span>{language === 'vi' ? docTienBangChu(currentInvoice.total) : readMoneyInEnglish(currentInvoice.total)}</div>
                <div className="flex justify-between text-center px-10 text-black"><div><p className="font-bold uppercase text-sm mb-1">{t.buyerSig}</p><p className="text-xs italic text-gray-500">{t.sigNote}</p></div><div><p className="font-bold uppercase text-sm mb-1">{t.sellerSig}</p><p className="text-xs italic text-gray-500">{t.sigNote}</p><div className="h-20"></div><p className="font-bold text-sm">Admin</p></div></div>
            </div>
        );
    }
    return (
        <div id="invoice-receipt" className="p-6 bg-white text-xs font-sans leading-relaxed w-full max-w-sm mx-auto text-black">
            <div className="text-center mb-4"><h2 className="text-base font-bold uppercase text-slate-900 leading-tight">{storeName}</h2>{storeWebsite && <p className="text-[10px] text-blue-600 italic">{t.website}: {storeWebsite}</p>}{storeHotline && <p className="text-[11px] text-red-600 font-bold">{t.hotline}: {storeHotline}</p>}<h1 className="text-xl font-bold uppercase mt-3 mb-1 border-t-2 border-black pt-2">{t.invoiceTitle}</h1></div>
            <div className="flex justify-between items-end mb-2 text-[10px] text-black border-b border-black pb-2"><div><p>{t.date}: {currentInvoice.date.split(' ')[1]}</p><p>{t.cashier}: AI / {userRole === 'STAFF' ? 'Admin' : 'Auto'}</p></div><div className="text-right"><p>{t.slipNo}: {currentInvoice.id}</p><p>{t.time}: {currentInvoice.date.split(' ')[0]}</p></div></div>
            <div className="mb-4 text-[11px] text-black"><div className="flex"><span className="font-bold w-16">{t.customer}:</span> <span>{currentInvoice.customerName}</span></div><div className="flex"><span className="font-bold w-16">{t.phone}:</span> <span>{currentInvoice.customerPhone}</span></div><div className="flex"><span className="font-bold w-16">{t.addressLabel}:</span> <span>{currentInvoice.customerAddress}</span></div></div>
            <table className="w-full mb-4 border-collapse text-[10px] text-black"><thead><tr className="border-b-2 border-black"><th className="py-1 text-left font-bold text-black">{t.item}</th><th className="py-1 text-center font-bold w-8 text-black">{t.qty}</th><th className="py-1 text-right font-bold w-16 text-black">{t.price}</th><th className="py-1 text-right font-bold w-16 text-black">{t.amount}</th></tr></thead><tbody>{currentInvoice.items.map((item, idx) => (<tr key={idx} className="border-b border-gray-300"><td className="py-2 text-left align-top text-black">{item.name}</td><td className="py-2 text-center align-top text-black">{item.cartQty}</td><td className="py-2 text-right align-top text-black">{item.price.toLocaleString('vi-VN')}</td><td className="py-2 text-right align-top font-bold text-black">{(item.price * item.cartQty).toLocaleString('vi-VN')}</td></tr>))}<tr className="border-t-2 border-black"><td colSpan={3} className="py-1 text-right pt-2 font-bold text-black">{t.subtotal}:</td><td className="py-1 text-right pt-2 text-black">{currentInvoice.subtotal.toLocaleString('vi-VN')}</td></tr><tr><td colSpan={3} className="py-1 text-right font-bold text-black">{t.tax}:</td><td className="py-1 text-right text-black">{currentInvoice.tax.toLocaleString('vi-VN')}</td></tr></tbody></table>
            <div className="border-t-2 border-black pt-2 mb-2"><div className="flex justify-between items-baseline"><span className="text-sm font-bold uppercase text-black">{t.total}:</span><span className="text-xl font-bold text-black">{currentInvoice.total.toLocaleString('vi-VN')}</span></div><div className="text-center italic mt-1 font-medium text-[11px]">({language === 'vi' ? docTienBangChu(currentInvoice.total) : readMoneyInEnglish(currentInvoice.total)})</div></div>
            <div className="text-center mt-6 text-[10px] text-gray-500 italic"><p>{t.thankYou}</p><p>{t.seeYou}</p></div>
        </div>
    );
  }, [currentInvoice, storeName, storeAddress, storeHotline, storeWebsite, language, t, userRole]);

  return (
    <div className="h-screen w-full flex flex-col md:flex-row bg-[#020617] text-slate-200 overflow-hidden relative font-sans">
      <audio ref={silentAudioRef} loop src={SILENT_AUDIO_URI} className="hidden" playsInline />
      
      {/* NETWORK STATUS INDICATOR */}
      {!isOnline && (
        <div className="fixed top-0 left-0 w-full bg-red-600 text-white text-[10px] font-bold text-center py-1 z-[9999] animate-pulse">
            {t.statusOffline} - {t.statusReconnecting}
        </div>
      )}

      {/* Cảnh báo: Bị đăng xuất vì đăng nhập thiết bị khác (Premium 1 thiết bị) */}
      {kickedMessage && (
        <div className="fixed inset-0 z-[310] bg-black/90 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-orange-500/50 rounded-2xl max-w-sm w-full p-6 text-center shadow-2xl">
            <div className="text-4xl mb-4">⚠️</div>
            <h3 className="text-lg font-bold text-white mb-2">Đăng xuất thiết bị</h3>
            <p className="text-slate-400 text-sm mb-6">{kickedMessage}</p>
            <p className="text-[10px] text-slate-500 mb-4">Tài khoản Premium chỉ được dùng trên 1 thiết bị. Thiết bị mới đăng nhập sẽ thay thế thiết bị cũ.</p>
            <button onClick={() => setKickedMessage(null)} className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold text-sm">Đóng</button>
          </div>
        </div>
      )}

      {/* Thông báo: Đã đăng nhập thiết bị mới, thiết bị cũ đã bị đăng xuất */}
      {deviceRegisteredRevoked && (
        <div className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:max-w-sm z-[305] bg-orange-500/20 border border-orange-500/50 rounded-xl p-4 shadow-xl flex items-start gap-3">
          <span className="text-2xl">📱</span>
          <div className="flex-1 text-left">
            <p className="text-xs font-bold text-orange-200">Bạn đã đăng nhập trên thiết bị mới.</p>
            <p className="text-[10px] text-slate-400 mt-1">Thiết bị cũ đã bị đăng xuất (giới hạn 1 thiết bị cho tài khoản Premium).</p>
          </div>
          <button onClick={() => setDeviceRegisteredRevoked(false)} className="text-slate-400 hover:text-white text-lg leading-none">×</button>
        </div>
      )}
      
      {/* LOGIN MODAL */}
      {showLoginModal && (
        <div className="fixed inset-0 z-[300] bg-black/95 flex items-center justify-center p-4">
            <div className="bg-slate-900 border border-indigo-500/50 rounded-2xl w-full max-w-sm p-8 text-center shadow-2xl relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500"></div>
                <div className="w-16 h-16 bg-indigo-600 rounded-2xl mx-auto mb-6 flex items-center justify-center text-2xl font-black text-white shadow-lg shadow-indigo-500/50">BM</div>
                <h2 className="text-2xl font-bold text-white mb-2">{t.loginTitle}</h2>
                <p className="text-slate-400 text-sm mb-6">{t.loginDesc}</p>
                {googleClientId ? (
                    <>
                        <div className="w-full flex justify-center">
                            <GoogleLogin
                                onSuccess={handleGoogleLoginSuccess}
                                onError={() => { triggerUISound('click'); setLoginError('Đăng nhập thất bại. Vui lòng thử lại.'); }}
                                useOneTap={false}
                            />
                        </div>
                        {loginError && <p className="text-red-400 text-sm mt-4">{loginError}</p>}
                    </>
                ) : (
                    <p className="text-amber-400/90 text-sm">Cần cấu hình <code className="bg-slate-800 px-1 rounded">VITE_GOOGLE_CLIENT_ID</code> trong file <code className="bg-slate-800 px-1 rounded">.env</code> (hoặc .env.local) để đăng nhập bằng Google. Lấy Client ID tại Google Cloud Console → APIs & Services → Credentials.</p>
                )}
                <p className="text-[10px] text-slate-600 mt-6">Secure Login • 14-Day Trial Included</p>
            </div>
        </div>
      )}

      {/* PAYWALL / SUBSCRIPTION MODAL */}
      {showPaywall && !showLoginModal && (
        <div className="fixed inset-0 z-[290] bg-slate-950/95 backdrop-blur-md flex items-center justify-center p-4">
            <div className="bg-slate-900 border border-red-500/30 rounded-2xl w-full max-w-4xl p-6 md:p-8 shadow-2xl overflow-y-auto max-h-[90vh]">
                {paymentSuccess ? (
                    <div className="flex flex-col items-center text-center py-8 animate-[fadeIn_0.3s_ease-out]">
                        <div className="w-20 h-20 rounded-full bg-emerald-500/20 flex items-center justify-center mb-6">
                            <span className="text-4xl">✓</span>
                        </div>
                        <h2 className="text-2xl font-black text-white mb-2">{t.paymentSuccess}</h2>
                        <p className="text-slate-400 text-sm mb-6">{t.paymentSuccessDetail.replace('{start}', new Date(paymentSuccess.startDate).toLocaleDateString()).replace('{end}', new Date(paymentSuccess.endDate).toLocaleDateString())}</p>
                        <div className="grid grid-cols-2 gap-4 w-full max-w-sm mb-8">
                            <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
                                <div className="text-[10px] font-bold text-slate-500 uppercase mb-1">Ngày bắt đầu</div>
                                <div className="text-lg font-bold text-white">{new Date(paymentSuccess.startDate).toLocaleDateString()}</div>
                            </div>
                            <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
                                <div className="text-[10px] font-bold text-slate-500 uppercase mb-1">Ngày kết thúc</div>
                                <div className="text-lg font-bold text-white">{new Date(paymentSuccess.endDate).toLocaleDateString()}</div>
                            </div>
                        </div>
                        <button onClick={handleClosePaymentSuccess} className="w-full max-w-xs py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold uppercase text-xs transition-colors">{t.back}</button>
                    </div>
                ) : !selectedPlan ? (
                    <>
                        <div className="flex justify-between items-start mb-8">
                            <div className="flex-1 text-center">
                                <h2 className="text-2xl md:text-3xl font-black text-white uppercase mb-2 text-transparent bg-clip-text bg-gradient-to-r from-red-400 to-orange-400">{t.upgradeTitle}</h2>
                                <p className="text-slate-400 text-sm">{t.upgradeDesc}</p>
                            </div>
                            {!isForcedLock && (
                                <button onClick={() => setShowPaywall(false)} className="text-slate-500 hover:text-white p-2">✕</button>
                            )}
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                            {PRICING_PLANS.map(plan => (
                                <div key={plan.id} onClick={() => setSelectedPlan(plan)} className={`relative bg-slate-800 border ${plan.id === '1y' ? 'border-yellow-500 shadow-yellow-900/20' : 'border-slate-700'} hover:border-indigo-500 rounded-xl p-6 cursor-pointer transition-all hover:-translate-y-1 shadow-lg group`}>
                                    {plan.id === '1y' && <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-yellow-500 text-black text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-wide">Best Value</div>}
                                    <h3 className="text-lg font-bold text-white mb-1">{plan.name}</h3>
                                    <div className="text-2xl font-black text-indigo-400 mb-1">{plan.price.toLocaleString()}đ</div>
                                    {plan.originalPrice && <div className="text-xs text-slate-500 line-through mb-4">{plan.originalPrice.toLocaleString()}đ</div>}
                                    <p className="text-xs text-slate-400 border-t border-slate-700 pt-4">{plan.description}</p>
                                    <div className="mt-4 w-full py-2 bg-slate-700 group-hover:bg-indigo-600 rounded-lg text-xs font-bold text-center uppercase transition-colors">Chọn</div>
                                </div>
                            ))}
                        </div>
                        <div className="mt-6 pt-6 border-t border-slate-700 flex flex-wrap items-center justify-center gap-4">
                            <span className="text-slate-400 text-xs">Cần tư vấn? Quét QR Zalo</span>
                            <a href={`https://zalo.me/${ZALO_PHONE}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 bg-slate-800/80 hover:bg-slate-700 rounded-lg px-3 py-2 border border-slate-600">
                                <img src={ZALO_QR_URL} alt="Zalo" className="w-10 h-10 rounded bg-white p-0.5" />
                                <span className="font-bold text-emerald-400">{ZALO_PHONE}</span>
                            </a>
                        </div>
                    </>
                ) : (
                    <div className="flex flex-col items-center animate-[fadeIn_0.3s_ease-out]">
                        <button onClick={() => { setSelectedPlan(null); setPaymentVerifyError(null); }} className="self-start text-slate-400 hover:text-white mb-4 flex items-center gap-2 text-xs font-bold uppercase">← {t.back}</button>
                        <h2 className="text-xl font-bold text-white mb-6 uppercase tracking-wide">{t.bankTransfer}</h2>
                        
                        <div className="bg-white p-4 rounded-xl mb-6 shadow-xl">
                            {/* SEPAY QR CODE */}
                            <img 
                                src={getSePayQrUrl(selectedPlan.price, `BAOMINH ${user?.email?.split('@')[0]} ${selectedPlan.id}`)} 
                                alt="SePay QR" 
                                className="w-64 h-64 object-contain"
                            />
                        </div>
                        
                        <div className="text-center space-y-2 mb-8">
                            <p className="text-sm text-slate-300">Gói: <span className="font-bold text-white">{selectedPlan.name}</span></p>
                            <p className="text-2xl font-black text-indigo-400">{selectedPlan.price.toLocaleString()} VND</p>
                            <p className="text-xs text-slate-500 mt-2">{t.scanQr}</p>
                        </div>

                        <button 
                            onClick={handleConfirmPayment} 
                            disabled={isVerifyingPayment}
                            className={`w-full max-w-xs py-3 rounded-xl font-bold uppercase tracking-widest text-xs transition-all ${isVerifyingPayment ? 'bg-slate-700 text-slate-500' : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-900/50'}`}
                        >
                            {isVerifyingPayment ? 'Đang kiểm tra từ SePay...' : t.iHavePaid}
                        </button>
                        {paymentVerifyError && (
                            <p className="mt-4 text-sm text-amber-400 bg-amber-900/20 border border-amber-500/50 rounded-lg px-4 py-3 text-center max-w-xs">{paymentVerifyError}</p>
                        )}
                    </div>
                )}
            </div>
        </div>
      )}

      {/* CHECKOUT MODAL */}
      {isCheckoutModalOpen && (
        <div className="fixed inset-0 z-[250] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md p-6 shadow-2xl relative animate-[fadeIn_0.2s_ease-out]">
                <h2 className="text-xl font-black text-white uppercase text-center mb-1">{t.checkoutTitle}</h2>
                <p className="text-center text-slate-400 text-xs mb-6">{t.requiredInfo}</p>
                <div className="space-y-4">
                    <div><label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">{t.customer} <span className="text-red-500">*</span></label><input type="text" value={checkoutForm.name} onChange={e => setCheckoutForm({...checkoutForm, name: e.target.value})} className="w-full bg-slate-800 border border-slate-600 rounded-lg px-4 py-3 text-sm text-white focus:border-indigo-500 focus:outline-none" placeholder="..." /></div>
                    <div><label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">{t.phone} <span className="text-red-500">*</span></label><input type="tel" value={checkoutForm.phone} onChange={e => setCheckoutForm({...checkoutForm, phone: e.target.value})} className="w-full bg-slate-800 border border-slate-600 rounded-lg px-4 py-3 text-sm text-white focus:border-indigo-500 focus:outline-none" placeholder="..." /></div>
                    <div><label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">{t.addressLabel} <span className="text-red-500">*</span></label><textarea value={checkoutForm.address} onChange={e => setCheckoutForm({...checkoutForm, address: e.target.value})} className="w-full bg-slate-800 border border-slate-600 rounded-lg px-4 py-3 text-sm text-white focus:border-indigo-500 focus:outline-none" rows={2} placeholder="..." /></div>
                </div>
                <div className="flex gap-3 mt-8"><button onClick={() => setIsCheckoutModalOpen(false)} className="flex-1 py-3 bg-slate-800 rounded-xl text-xs font-bold uppercase text-slate-400 hover:bg-slate-700">{t.cancel}</button><button onClick={() => handleConfirmCheckout()} className="flex-[2] py-3 bg-indigo-600 rounded-xl text-xs font-bold uppercase text-white hover:bg-indigo-500 shadow-lg shadow-indigo-600/20">{t.confirmPay}</button></div>
            </div>
        </div>
      )}
      
      {/* STANDBY OVERLAY */}
      {isStandby && (
        <div onClick={() => setIsStandby(false)} className="fixed inset-0 z-[9999] bg-black flex flex-col items-center justify-center cursor-pointer">
            <div className="absolute top-10 left-1/2 -translate-x-1/2 w-px h-20 bg-gradient-to-b from-transparent via-slate-800 to-transparent"></div>
            <div className="text-center space-y-4">
                <div className="text-[80px] font-thin text-slate-800 tracking-tighter select-none font-mono">{new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</div>
                <div className="flex items-center justify-center gap-2"><div className="w-2 h-2 rounded-full bg-red-500 animate-ping"></div><span className="text-[10px] font-bold text-slate-700 uppercase tracking-[0.3em]">{useRemoteMic ? 'REMOTE MIC LISTENING' : 'AI LISTENING'}</span></div>
                {status === SessionStatus.CONNECTED && (<div className="text-[9px] text-slate-800 font-mono mt-8">Connection Active • {useRemoteMic ? 'ESP32 Mic' : 'Local Mic'}</div>)}
            </div>
            <div className="absolute bottom-10 text-[9px] text-slate-800 animate-pulse">TOUCH TO WAKE UP</div>
        </div>
      )}

      {/* INVOICE MODAL */}
      {currentInvoice && (
        <div className="fixed inset-0 z-[200] bg-black/90 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className={`bg-white text-black relative shadow-2xl overflow-hidden rounded-lg transition-all ${currentInvoice.isWholesale ? 'w-full max-w-4xl' : 'w-full max-w-md'}`}>
            <button onClick={() => setCurrentInvoice(null)} className="absolute top-2 right-2 text-black/50 hover:text-black z-50 p-2 bg-gray-100 rounded-full">✕</button>
            <div className="max-h-[85vh] overflow-y-auto scrollbar-hide">{InvoiceContent}</div>
            <div className="bg-gray-50 p-4 border-t flex gap-2"><button onClick={handleDownloadPDF} className="flex-1 bg-slate-900 text-white hover:bg-slate-800 py-3 rounded-lg text-xs font-bold uppercase flex items-center justify-center gap-2 transition-colors">{t.printPdf}</button></div>
          </div>
        </div>
      )}
      
      {!isVoiceOnly && !isSensorMode && !useRemoteMic && <CameraView isActive={status === SessionStatus.CONNECTED} showPreview={showCameraPreview} esp32Ip={esp32Ip} onFrame={handleFrame} onError={e => addLog(e, 'error')} />}
      
      {isSensorMode && (
         <div className="fixed bottom-4 left-4 z-[100] w-24 h-24 rounded-full border-2 border-white/10 flex items-center justify-center bg-black/50 backdrop-blur-sm shadow-xl">
            <div className={`w-16 h-16 rounded-full transition-all duration-500 ${motionDetected ? 'bg-red-500 animate-ping opacity-75' : 'bg-slate-700'}`}></div>
            <div className="absolute inset-0 flex flex-col items-center justify-center text-[8px] font-black uppercase tracking-widest text-white"><span>PIR</span><span className={motionDetected ? 'text-red-400' : 'text-slate-500'}>{motionDetected ? 'MOTION' : 'IDLE'}</span></div>
         </div>
      )}

      <div className="flex-1 flex flex-col p-4 sm:p-8 md:p-12 space-y-6 relative overflow-hidden h-full">
        <div className="flex justify-between items-center z-10 h-14 sm:h-auto">
          <div className="flex items-center space-x-3">
             <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-black ${status === SessionStatus.CONNECTED ? 'bg-indigo-600 shadow-lg shadow-indigo-600/30' : 'bg-slate-800'}`}>BM</div>
             <div><h1 className="font-black text-white uppercase text-lg leading-none">BẢO MINH AI</h1><div className="flex gap-2 text-[9px] font-bold text-slate-500 uppercase mt-1"><span className="text-indigo-400">{storeName}</span><span className="text-slate-700">|</span><span>{userRole === 'STAFF' ? t.roleStaff : t.roleCustomer}</span></div></div>
          </div>
          <div className="flex gap-2 items-center">
            {/* TRIAL & PREMIUM BANNER */}
            {user && !user.isPremium ? (
                <div className="hidden md:flex px-3 py-1 bg-gradient-to-r from-orange-500/20 to-red-500/20 border border-orange-500/50 rounded-lg text-[10px] font-bold text-orange-200 items-center gap-2">
                    <span className="animate-pulse">⏳</span>
                    {t.trialBanner && t.trialBanner.replace('{days}', String(trialDaysLeft)).replace('{minutes}', String(DAILY_LIMIT_MINUTES - dailyMinutesUsed))}
                </div>
            ) : user && user.isPremium && user.expiryDate ? (
                <div 
                    onClick={() => setShowPaywall(true)}
                    className="hidden md:flex px-3 py-1 bg-gradient-to-r from-indigo-500/20 to-purple-500/20 border border-indigo-500/50 rounded-lg text-[10px] font-bold text-indigo-200 items-center gap-2 cursor-pointer hover:bg-indigo-500/30 transition-colors"
                    title="Click to see details"
                >
                    <span className="text-yellow-400">★</span>
                    {t.premiumBanner.replace('{start}', new Date(user.premiumStartDate ?? user.trialStartDate).toLocaleDateString()).replace('{end}', new Date(user.expiryDate!).toLocaleDateString())}
                </div>
            ) : null}
            {user && (
                <button onClick={handleLogout} className="hidden sm:flex px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-[9px] font-bold uppercase text-slate-400 hover:text-red-400 hover:border-red-500/30 transition-colors" title="Đăng xuất">{user.email?.split('@')[0]}</button>
            )}
            <button onClick={() => setIsStandby(true)} className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-[10px] font-black uppercase text-slate-400 hover:text-white transition-colors flex items-center gap-1" title={t.standbyMode}>
                 <span>🌙</span><span className="hidden sm:inline">{t.standbyMode}</span>
            </button>

            <button onClick={() => { const currentIndex = LANGUAGES.findIndex(l => l.code === language); const nextIndex = (currentIndex + 1) % LANGUAGES.length; setLanguage(LANGUAGES[nextIndex].code as any); }} className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-[10px] font-black uppercase text-white hover:bg-slate-700 transition-colors flex items-center gap-1"><span>{LANGUAGES.find(l => l.code === language)?.flag}</span><span>{LANGUAGES.find(l => l.code === language)?.label}</span></button>
            <button onClick={() => setUserRole(prev => prev === 'STAFF' ? 'CUSTOMER' : 'STAFF')} className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-[9px] font-black uppercase text-slate-400 hover:text-white transition-colors">ROLE: {userRole}</button>
            <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="md:hidden p-2 bg-slate-800 rounded-xl text-slate-400">☰</button>
          </div>
        </div>

        <div className="flex-1 flex flex-col items-center justify-center relative">
          <div className={`w-48 h-48 sm:w-64 sm:h-64 rounded-full flex items-center justify-center transition-all duration-500 ${isAISpeaking ? 'bg-indigo-600 shadow-[0_0_100px_rgba(79,70,229,0.5)] scale-110' : isUserSpeaking ? 'bg-emerald-600 shadow-[0_0_100px_rgba(16,185,129,0.5)] scale-110' : 'bg-slate-800'}`}>
             <div className="text-4xl font-black text-white tracking-widest">{isAISpeaking ? 'AI' : isUserSpeaking ? '...' : 'BM'}</div>
          </div>
          <div className="mt-12 text-center space-y-2 z-10">
             <div className="text-xs font-black text-slate-500 uppercase tracking-[0.3em]">HỆ THỐNG</div>
             <div className="text-lg font-bold text-white max-w-md mx-auto leading-relaxed">{status === SessionStatus.CONNECTED ? (isAISpeaking ? t.statusSpeaking : isUserSpeaking ? t.statusListening : t.statusIdle) : "Offline"}</div>
             {useRemoteMic && <div className="text-[10px] text-orange-400 bg-orange-900/20 px-3 py-1 rounded-full inline-block animate-pulse">{t.remoteMicOn}</div>}
          </div>
        </div>

        <button onClick={connectToAI} disabled={status === SessionStatus.CONNECTING} className={`w-full py-6 rounded-[2rem] text-xl font-black transition-all active:scale-95 shadow-xl z-10 ${status === SessionStatus.CONNECTED ? 'bg-slate-800 text-red-500 border border-red-500/20' : 'bg-indigo-600 text-white'}`}>
           {status === SessionStatus.CONNECTING ? t.statusConnecting : status === SessionStatus.CONNECTED ? t.statusStop : t.statusStart}
        </button>
      </div>

      <div className={`fixed inset-y-0 right-0 w-full sm:w-[400px] bg-[#0f172a] border-l border-white/5 flex flex-col shadow-2xl z-[160] transition-transform duration-300 ${isSidebarOpen ? 'translate-x-0' : 'translate-x-full'} md:translate-x-0 md:relative md:z-20`}>
         <div className="flex bg-black/20">
            <button onClick={() => setSidebarTab('chat')} className={`flex-1 py-4 text-[10px] font-black uppercase tracking-widest ${sidebarTab === 'chat' ? 'text-indigo-400 border-b-2 border-indigo-500' : 'text-slate-600'}`}>{t.tabChat}</button>
            <button onClick={() => setSidebarTab('inventory')} className={`flex-1 py-4 text-[10px] font-black uppercase tracking-widest ${sidebarTab === 'inventory' ? 'text-indigo-400 border-b-2 border-indigo-500' : 'text-slate-600'}`}>{t.tabPos}</button>
            <button onClick={() => setSidebarTab('crm')} className={`flex-1 py-4 text-[10px] font-black uppercase tracking-widest ${sidebarTab === 'crm' ? 'text-indigo-400 border-b-2 border-indigo-500' : 'text-slate-600'}`}>{t.tabCrm}</button>
            <button onClick={() => setSidebarTab('logs')} className={`flex-1 py-4 text-[10px] font-black uppercase tracking-widest ${sidebarTab === 'logs' ? 'text-indigo-400 border-b-2 border-indigo-500' : 'text-slate-600'}`}>{t.tabLogs}</button>
            <button onClick={() => setSidebarTab('settings')} className={`flex-1 py-4 text-[10px] font-black uppercase tracking-widest ${sidebarTab === 'settings' ? 'text-indigo-400 border-b-2 border-indigo-500' : 'text-slate-600'}`}>{t.tabSettings}</button>
         </div>
         <div className="flex-1 overflow-y-auto p-6 scrollbar-hide">
            {sidebarTab === 'chat' && (
              <div className="space-y-4">
                 <div className="flex justify-between items-center mb-6 border-b border-white/5 pb-2">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{t.historyChat}</span>
                    <div className="flex gap-2">
                        <button onClick={handleManualClearHistory} className="flex items-center gap-1 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 px-2 py-1.5 rounded-lg text-[9px] font-bold uppercase text-red-400 transition-all active:scale-95">🗑 {t.clear}</button>
                        <button onClick={() => setIsSidebarOpen(false)} className="flex items-center gap-2 bg-indigo-600/20 hover:bg-indigo-600/40 border border-indigo-500/30 px-3 py-1.5 rounded-lg text-[9px] font-black uppercase text-indigo-400 transition-all active:scale-95"><span>🏠 {t.home}</span></button>
                    </div>
                 </div>
                 {transcriptions.length === 0 ? (<div className="text-center py-20 opacity-20"><div className="text-4xl mb-4">💬</div><div className="text-[10px] font-bold uppercase">...</div></div>) : (transcriptions.map((t, i) => (<div key={i} className={`flex flex-col ${t.isUser ? 'items-end' : 'items-start'} animate-[fadeIn_0.2s_ease-out]`}><div className={`p-3 rounded-2xl text-xs max-w-[90%] shadow-sm ${t.isUser ? 'bg-indigo-600 text-white rounded-tr-none' : 'bg-slate-800 text-slate-300 rounded-tl-none border border-white/5'}`}>{t.text}</div><span className="text-[8px] text-slate-600 mt-1 px-1">{new Date(t.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span></div>)))}
              </div>
            )}
            {sidebarTab === 'inventory' && renderInventoryTab()}
            {sidebarTab === 'crm' && renderCRMTab()}
            {sidebarTab === 'settings' && renderSettingsTab()}
            {sidebarTab === 'logs' && renderLogsTab()}
         </div>
      </div>
      {isSidebarOpen && <div className="fixed inset-0 bg-black/80 z-[150] md:hidden" onClick={() => setIsSidebarOpen(false)} />}
    </div>
  );
};

export default App;
