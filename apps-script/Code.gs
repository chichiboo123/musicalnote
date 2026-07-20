/**
 * 관극노트 백엔드 — Google Apps Script
 *
 * 설치 방법 (자세한 내용은 리포지토리 README.md 참고):
 * 1. Google 스프레드시트를 새로 만든다.
 * 2. 확장 프로그램 → Apps Script 를 열고 이 파일 내용을 붙여넣는다.
 * 3. 프로젝트 설정(⚙️) → 스크립트 속성에 ADMIN_TOKEN 속성을 추가한다.
 *    (관리자 로그인에 사용할 비밀번호. 길고 추측하기 어려운 값 권장)
 * 4. 배포 → 새 배포 → 유형: 웹 앱
 *    - 실행 계정: 나
 *    - 액세스 권한: 모든 사용자
 * 5. 발급된 웹 앱 URL을 GitHub 리포지토리의 APPS_SCRIPT_URL 시크릿에 등록한다.
 */

var SHEET_NAME = 'records';
var POSTER_FOLDER_NAME = 'MusicalNote-Posters';
var HEADERS = [
  'id', 'title', 'venue', 'viewDate', 'cast', 'seat', 'runningTime',
  'synopsis', 'rating', 'review', 'posterUrl', 'isPublic',
  'createdAt', 'updatedAt'
];

function doGet(e) {
  return respond(handleRequest((e && e.parameter) || {}));
}

function doPost(e) {
  var body = {};
  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {}
  return respond(handleRequest(body));
}

function handleRequest(req) {
  try {
    var isAdmin = checkToken(req.token);
    switch (req.action) {
      case 'list':
        return { ok: true, admin: isAdmin, records: listRecords(isAdmin) };
      case 'verify':
        return { ok: true, admin: isAdmin };
      case 'create':
        requireAdmin(isAdmin);
        return { ok: true, record: createRecord(req.record || {}) };
      case 'update':
        requireAdmin(isAdmin);
        return { ok: true, record: updateRecord(req.record || {}) };
      case 'delete':
        requireAdmin(isAdmin);
        deleteRecord(req.id);
        return { ok: true };
      case 'uploadPoster':
        requireAdmin(isAdmin);
        return { ok: true, url: uploadPoster(req.data, req.mimeType) };
      case 'kopis':
        requireAdmin(isAdmin);
        return { ok: true, info: kopisLookup(req.title) };
      default:
        return { ok: false, error: '알 수 없는 요청입니다: ' + req.action };
    }
  } catch (err) {
    return { ok: false, error: String((err && err.message) || err) };
  }
}

function respond(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function checkToken(token) {
  var saved = PropertiesService.getScriptProperties().getProperty('ADMIN_TOKEN');
  return !!(saved && token && token === saved);
}

function requireAdmin(isAdmin) {
  if (!isAdmin) throw new Error('관리자 인증에 실패했습니다.');
}

function getSheet() {
  var ss = SpreadsheetApp.getActive();
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function rowToRecord(row) {
  var rec = {};
  for (var i = 0; i < HEADERS.length; i++) {
    var v = row[i];
    if (v instanceof Date) v = Utilities.formatDate(v, 'Asia/Seoul', 'yyyy-MM-dd');
    rec[HEADERS[i]] = v === undefined || v === null ? '' : v;
  }
  rec.rating = rec.rating === '' ? 0 : Number(rec.rating);
  rec.isPublic = rec.isPublic === true || rec.isPublic === 'TRUE' || rec.isPublic === 'true';
  return rec;
}

function recordToRow(rec) {
  return HEADERS.map(function (h) {
    var v = rec[h];
    if (h === 'isPublic') return v ? 'TRUE' : 'FALSE';
    return v === undefined || v === null ? '' : v;
  });
}

function listRecords(isAdmin) {
  var sheet = getSheet();
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  var values = sheet.getRange(2, 1, lastRow - 1, HEADERS.length).getValues();
  var records = values.map(rowToRecord).filter(function (r) { return r.id; });
  if (!isAdmin) {
    records = records.filter(function (r) { return r.isPublic; });
  }
  return records;
}

function findRowById(sheet, id) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return -1;
  var ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === String(id)) return i + 2;
  }
  return -1;
}

function sanitizeRecord(rec) {
  var out = {};
  HEADERS.forEach(function (h) {
    out[h] = rec[h] === undefined || rec[h] === null ? '' : rec[h];
  });
  out.isPublic = rec.isPublic === true || rec.isPublic === 'true' || rec.isPublic === 'TRUE';
  out.rating = Number(rec.rating) || 0;
  return out;
}

function createRecord(rec) {
  var sheet = getSheet();
  var now = new Date().toISOString();
  var clean = sanitizeRecord(rec);
  clean.id = Utilities.getUuid();
  clean.createdAt = now;
  clean.updatedAt = now;
  sheet.appendRow(recordToRow(clean));
  return clean;
}

function updateRecord(rec) {
  var sheet = getSheet();
  var rowIndex = findRowById(sheet, rec.id);
  if (rowIndex < 0) throw new Error('해당 기록을 찾을 수 없습니다.');
  var existing = rowToRecord(
    sheet.getRange(rowIndex, 1, 1, HEADERS.length).getValues()[0]
  );
  var clean = sanitizeRecord(rec);
  clean.id = existing.id;
  clean.createdAt = existing.createdAt;
  clean.updatedAt = new Date().toISOString();
  sheet.getRange(rowIndex, 1, 1, HEADERS.length).setValues([recordToRow(clean)]);
  return clean;
}

function deleteRecord(id) {
  var sheet = getSheet();
  var rowIndex = findRowById(sheet, id);
  if (rowIndex < 0) throw new Error('해당 기록을 찾을 수 없습니다.');
  sheet.deleteRow(rowIndex);
}

/**
 * base64 이미지를 Google Drive에 저장하고 외부에서 볼 수 있는 URL을 돌려준다.
 */
function uploadPoster(base64Data, mimeType) {
  if (!base64Data) throw new Error('이미지 데이터가 없습니다.');
  var folder = getPosterFolder();
  var ext = (mimeType || 'image/jpeg').split('/')[1] || 'jpg';
  var blob = Utilities.newBlob(
    Utilities.base64Decode(base64Data),
    mimeType || 'image/jpeg',
    'poster-' + Date.now() + '.' + ext
  );
  var file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return 'https://lh3.googleusercontent.com/d/' + file.getId();
}

function getPosterFolder() {
  var folders = DriveApp.getFoldersByName(POSTER_FOLDER_NAME);
  if (folders.hasNext()) return folders.next();
  return DriveApp.createFolder(POSTER_FOLDER_NAME);
}

/**
 * 공연예술통합전산망(KOPIS) Open API로 공연 정보를 조회한다.
 * 서비스키는 스크립트 속성 KOPIS_API_KEY 에 저장한다. (클라이언트에 노출되지 않음)
 * 1) 공연명으로 목록을 검색해 가장 잘 맞는 공연을 고르고
 * 2) 그 공연ID로 상세 정보를 받아 앱 입력 폼에 맞는 형태로 돌려준다.
 */
var KOPIS_BASE = 'http://www.kopis.or.kr/openApi/restful/pblprfr';

function kopisLookup(title) {
  title = (title || '').toString().trim();
  if (!title) throw new Error('작품명이 없습니다.');
  var key = PropertiesService.getScriptProperties().getProperty('KOPIS_API_KEY');
  if (!key) throw new Error('KOPIS_API_KEY 스크립트 속성이 설정되지 않았습니다. Apps Script 프로젝트 설정에서 추가하세요.');

  // 공연시작일 기준 넓은 기간으로 이름 검색 (장기공연 포함하도록 과거까지 넓게).
  var eddate = Utilities.formatDate(
    new Date(Date.now() + 365 * 24 * 3600 * 1000), 'Asia/Seoul', 'yyyyMMdd');
  var listUrl = KOPIS_BASE
    + '?service=' + encodeURIComponent(key)
    + '&stdate=20000101&eddate=' + eddate
    + '&cpage=1&rows=50'
    + '&shprfnm=' + encodeURIComponent(title);
  var items = kopisFetch(listUrl).getRootElement().getChildren('db');
  if (!items || items.length === 0) {
    throw new Error('KOPIS에서 "' + title + '" 검색 결과가 없습니다. 작품명을 확인해 주세요.');
  }

  // 매칭 우선순위: 이름 정확도 > 뮤지컬 장르 > 최신 공연.
  var q = normalizeName(title);
  var scored = items.map(function (db) {
    var name = normalizeName(kopisText(db, 'prfnm'));
    var exact = name === q ? 2 : (name.indexOf(q) >= 0 || q.indexOf(name) >= 0 ? 1 : 0);
    var musical = kopisText(db, 'genrenm').indexOf('뮤지컬') >= 0 ? 1 : 0;
    return { db: db, exact: exact, musical: musical, from: kopisText(db, 'prfpdfrom') };
  });
  scored.sort(function (a, b) {
    if (b.exact !== a.exact) return b.exact - a.exact;
    if (b.musical !== a.musical) return b.musical - a.musical;
    return (b.from || '').localeCompare(a.from || '');
  });

  var mt20id = kopisText(scored[0].db, 'mt20id');
  if (!mt20id) throw new Error('KOPIS 공연 ID를 찾지 못했습니다.');

  // 상세 조회.
  var detailUrl = KOPIS_BASE + '/' + encodeURIComponent(mt20id)
    + '?service=' + encodeURIComponent(key);
  var d = kopisFetch(detailUrl).getRootElement().getChild('db');
  if (!d) throw new Error('KOPIS 상세 정보를 불러오지 못했습니다.');

  var cast = kopisText(d, 'prfcast');
  return {
    title: kopisText(d, 'prfnm'),
    venue: kopisText(d, 'fcltynm'),
    runningTime: kopisText(d, 'prfruntime'),
    synopsis: kopisText(d, 'sty'),
    // 출연진은 콤마 구분 → 줄바꿈으로 정리.
    cast: cast ? cast.split(/\s*,\s*/).filter(String).join('\n') : '',
    // 포스터는 http로 오므로 https로 바꿔 혼합콘텐츠 차단을 피한다.
    posterUrl: kopisText(d, 'poster').replace(/^http:\/\//i, 'https://'),
    genre: kopisText(d, 'genrenm'),
    state: kopisText(d, 'prfstate'),
    period: kopisText(d, 'prfpdfrom') + ' ~ ' + kopisText(d, 'prfpdto')
  };
}

function kopisFetch(url) {
  var res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  var code = res.getResponseCode();
  var text = res.getContentText('UTF-8');
  if (code !== 200) {
    throw new Error('KOPIS API 호출 실패 (' + code + '). 서비스키 또는 승인 상태를 확인하세요.');
  }
  var doc;
  try {
    doc = XmlService.parse(text);
  } catch (e) {
    throw new Error('KOPIS 응답을 해석하지 못했습니다. (서비스키가 잘못되었거나 승인되지 않았을 수 있습니다)');
  }
  // 키/파라미터 오류 시 KOPIS는 200에 에러 XML을 주기도 한다.
  var rootName = doc.getRootElement().getName();
  if (rootName !== 'dbs') {
    var errMsg = kopisText(doc.getRootElement(), 'returnReasonCode')
      || kopisText(doc.getRootElement(), 'errMsg')
      || text.slice(0, 120);
    throw new Error('KOPIS 오류 응답: ' + errMsg);
  }
  return doc;
}

function kopisText(el, name) {
  if (!el) return '';
  var c = el.getChild(name);
  return c ? String(c.getText() || '').trim() : '';
}

function normalizeName(s) {
  return String(s || '').replace(/\s+/g, '').toLowerCase();
}

/**
 * (선택) 에디터에서 한 번 실행하면 시트와 헤더를 미리 만들어 준다.
 */
function setup() {
  getSheet();
}
