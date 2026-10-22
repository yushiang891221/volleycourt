/**
 * 新竹排球館 市場調查問卷 —— 一鍵建立 Google 表單
 *
 * 使用方式：
 * 1. 打開 https://script.google.com ，點「新專案」
 * 2. 把預設的 function myFunction() {} 全部刪掉，貼上這整份程式碼
 * 3. 上方函式選單選 createVolleyballSurvey，按「執行」
 * 4. 第一次會要求授權（建立表單、試算表），選你的 Google 帳號 → 進階 → 前往專案 → 允許
 * 5. 執行完看下方「執行紀錄」：會印出 填答連結、編輯連結、回覆試算表連結
 *
 * 題目、選項都可以在下方 AREAS / 各題陣列直接改，改完重新執行會建立一份新的表單。
 */

// 新竹地區分區（Q 住哪裡 / 上班在哪裡 共用）
const AREAS = [
  '竹北・高鐵站／縣政特區一帶',
  '竹北・市區（光明商圈、中正路一帶）',
  '竹北・台元／中正西路／新社一帶',
  '新竹市東區・竹科／關新／光復路一帶',
  '新竹市東區・市中心／火車站一帶',
  '新竹市北區',
  '新竹市香山區',
  '寶山',
  '竹東',
  '芎林',
  '橫山／北埔／峨眉',
  '湖口／新豐',
  '頭份／竹南',
];

// 候選開館地點（用來問「開在這裡你會不會去」）
const CANDIDATE_SITES = [
  '竹北高鐵站／縣政特區',
  '竹北市區',
  '竹北台元／中正西路',
  '新竹市東區（竹科周邊）',
  '新竹市北區（火車站周邊）',
  '香山',
  '竹東',
  '芎林',
  '湖口／新豐',
];

function createVolleyballSurvey() {
  const form = FormApp.create('新竹排球館 市場調查｜你想在哪裡打排球？');
  form.setDescription(
    '我們正在規劃在新竹開一間室內排球館，想了解大家打球的習慣、方便的地點和時段。\n' +
    '問卷約 3–4 分鐘，答案只用於規劃參考，不會公開個人資料。\n' +
    '填完可以選擇留下聯絡方式，開幕時會優先通知你試打優惠 🏐'
  );
  form.setProgressBar(true);
  form.setCollectEmail(false);
  form.setAllowResponseEdits(false);
  form.setConfirmationMessage('感謝填寫！你的意見會直接影響球館開在哪裡、怎麼設計 🙌');

  // ===== 第 1 部分：打球習慣 =====
  form.addSectionHeaderItem().setTitle('1｜你的打球習慣');

  form.addMultipleChoiceItem()
    .setTitle('你目前多久打一次排球？')
    .setChoiceValues([
      '每週 2 次以上',
      '每週約 1 次',
      '每月 1–3 次',
      '幾個月一次',
      '目前沒在打，但想開始或回鍋',
    ])
    .setRequired(true);

  form.addCheckboxItem()
    .setTitle('你目前通常在哪裡打？（可複選）')
    .setChoiceValues([
      '戶外野場（清大、交大、高鐵世興球場等）',
      '私人室內排球館',
      '國民運動中心、學校體育館',
      '公司或社團固定場地',
      '目前沒有固定地方打',
    ])
    .showOtherOption(true)
    .setRequired(true);

  form.addMultipleChoiceItem()
    .setTitle('你的程度大概是？')
    .setChoiceValues([
      '新手／剛開始學',
      '歡樂業餘，會打但不專精',
      '系隊、校隊程度',
      '甲組、企業隊或更高',
    ])
    .setRequired(true);

  form.addMultipleChoiceItem()
    .setTitle('你通常打哪種網高？')
    .setChoiceValues(['男網', '女網', '混排', '都可以'])
    .setRequired(true);

  form.addCheckboxItem()
    .setTitle('你偏好的打球方式？（可複選）')
    .setChoiceValues([
      '臨打（一個人報名、現場分隊）',
      '跟固定球隊包場',
      '分級季打（同程度固定班底）',
      '上課、教練訓練',
      '比賽、業餘聯賽',
    ])
    .setRequired(true);

  // ===== 第 2 部分：地點與交通 =====
  form.addPageBreakItem().setTitle('2｜地點與交通');

  form.addMultipleChoiceItem()
    .setTitle('你住在哪一區？')
    .setChoiceValues(AREAS)
    .showOtherOption(true)
    .setRequired(true);

  form.addMultipleChoiceItem()
    .setTitle('你平日上班或上課在哪一區？')
    .setChoiceValues(AREAS.concat(['不適用（在家工作、沒有固定地點）']))
    .showOtherOption(true)
    .setRequired(true);

  form.addMultipleChoiceItem()
    .setTitle('你通常怎麼去打球？')
    .setChoiceValues(['機車', '汽車', '大眾運輸', '走路或腳踏車', '跟球友共乘'])
    .setRequired(true);

  form.addMultipleChoiceItem()
    .setTitle('去打球，單程最多願意花多久？')
    .setChoiceValues(['10 分鐘內', '20 分鐘內', '30 分鐘內', '30 分鐘以上也可以'])
    .setRequired(true);

  form.addGridItem()
    .setTitle('如果新球館開在下面這些地點，你會去打嗎？')
    .setHelpText('每一列選一個就好')
    .setRows(CANDIDATE_SITES)
    .setColumns(['一定會去', '可能會去', '不太會去', '不會去'])
    .setRequired(true);

  // ===== 第 3 部分：時段與價格 =====
  form.addPageBreakItem().setTitle('3｜時段與價格');

  form.addCheckboxItem()
    .setTitle('你最常能打球的時段？（可複選）')
    .setChoiceValues([
      '平日早上（9–12 點）',
      '平日下午（12–18 點）',
      '平日晚上（18–22 點）',
      '平日宵夜（22 點以後）',
      '週末上午',
      '週末下午',
      '週末晚上',
    ])
    .setRequired(true);

  form.addMultipleChoiceItem()
    .setTitle('臨打一次（約 3 小時），每人可以接受的價格？')
    .setChoiceValues([
      '150 元以下',
      '150–200 元',
      '200–250 元',
      '250–300 元',
      '300 元以上也可以（場地好的話）',
    ])
    .setRequired(true);

  form.addMultipleChoiceItem()
    .setTitle('如果由你幫球隊包場，一個時段（約 3 小時）可接受的場租？')
    .setChoiceValues([
      '我不負責包場',
      '3,000 元以下',
      '3,000–3,800 元',
      '3,800–4,500 元',
      '4,500 元以上',
    ])
    .setRequired(true);

  form.addMultipleChoiceItem()
    .setTitle('會考慮季租或月票嗎？')
    .setChoiceValues([
      '會，固定時段比較有保障',
      '看價格和折扣',
      '不會，想保持彈性',
    ])
    .setRequired(true);

  // ===== 第 4 部分：場地需求 =====
  form.addPageBreakItem().setTitle('4｜你在意的場地條件');

  form.addCheckboxItem()
    .setTitle('現在打球最困擾你的是？（可複選）')
    .setChoiceValues([
      '熱門時段搶不到',
      '離家或公司太遠',
      '太熱、通風差',
      '地板太滑或太硬',
      '天花板太低，高球會碰到',
      '停車不方便',
      '程度落差太大',
      '價格偏高',
      '沒有淋浴或更衣空間',
      '報名、付款流程麻煩',
    ])
    .showOtherOption(true);

  form.addCheckboxItem()
    .setTitle('新球館最希望有哪些設施？（可複選）')
    .setChoiceValues([
      '冷氣或大型工業風扇',
      '淋浴間',
      '更衣室、置物櫃',
      '休息區或觀賽區',
      '飲料、販賣部',
      '汽機車停車位',
      '器材販售或租借',
      '線上預約、付款',
      '暖身伸展區',
    ])
    .showOtherOption(true);

  form.addMultipleChoiceItem()
    .setTitle('哪一點最能讓你願意換到一間新球館？（單選）')
    .setChoiceValues([
      '離我比較近',
      '價格比較便宜',
      '場地品質更好（地板、高度、通風）',
      '時段比較好排',
      '有程度相近的球友',
      '有教練或課程',
    ])
    .setRequired(true);

  form.addCheckboxItem()
    .setTitle('你會想參加哪些活動或服務？（可複選）')
    .setChoiceValues([
      '新手體驗課',
      '進階技術訓練課',
      '分級季打',
      '業餘聯賽或盃賽',
      '公司包場、員工活動',
      '兒童、青少年營隊',
    ])
    .showOtherOption(true);

  // 複合式場館：如果只開 1 面排球場，平日白天可以改租其他運動
  form.addCheckboxItem()
    .setTitle('除了排球，你也會想在同一間館打哪些運動？（可複選）')
    .setChoiceValues([
      '羽球',
      '匹克球',
      '籃球（3 對 3 半場）',
      '只打排球，其他不需要',
    ])
    .showOtherOption(true);

  form.addMultipleChoiceItem()
    .setTitle('如果球館同時開放羽球、匹克球等運動（排球時段不變），你的感覺是？')
    .setChoiceValues([
      '很好，可以帶不打排球的朋友來',
      '沒差',
      '不太好，感覺不夠專業',
    ]);

  // ===== 第 5 部分：關於你 =====
  form.addPageBreakItem().setTitle('5｜關於你（最後幾題）');

  form.addMultipleChoiceItem()
    .setTitle('你的年齡')
    .setChoiceValues(['18 歲以下', '18–24 歲', '25–34 歲', '35–44 歲', '45 歲以上'])
    .setRequired(true);

  form.addMultipleChoiceItem()
    .setTitle('你目前的身分')
    .setChoiceValues(['學生', '竹科或科技業上班族', '其他上班族', '自由業', '其他'])
    .setRequired(true);

  form.addTextItem()
    .setTitle('想收到開幕和試打優惠通知嗎？留下 Email 或 LINE ID（選填）')
    .setHelpText('只用於開幕通知，不會提供給其他人');

  form.addParagraphTextItem()
    .setTitle('還有什麼想對未來的球館說的嗎？（選填）');

  // ===== 回覆自動存到 Google 試算表 =====
  const ss = SpreadsheetApp.create('新竹排球館問卷｜回覆');
  form.setDestination(FormApp.DestinationType.SPREADSHEET, ss.getId());

  // 較新的 Google 表單需要「發布」才能填寫；舊版沒有這個方法就略過
  try { if (typeof form.setPublished === 'function') form.setPublished(true); } catch (e) {}
  try { form.setAcceptingResponses(true); } catch (e) {}

  Logger.log('✅ 填答連結（發到 LINE 群、Threads）：' + form.getPublishedUrl());
  Logger.log('✏️ 編輯連結（自己改題目用）：' + form.getEditUrl());
  Logger.log('📊 回覆試算表：' + ss.getUrl());
}
