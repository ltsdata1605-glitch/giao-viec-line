var TOKEN = "bhMDrvleSNIAV5djrdcywK+3twGH2ieIoA0Gz8rGfMM5rWvf567l286zOaw3KiHfAn/Tj9MXiMutjRUa0cETpzhV6Z8H0SqfqQbdGUu3TTk7xuXK+JZIGCnz17oGQW5Fhl9JDtnJIALIz7P0pCRSIQdB04t89/1O/w1cDnyilFU=";
// DÁN CHANNEL ACCESS TOKEN CỦA LINE BOT VÀO ĐÂY
// Khuyến nghị: sau khi chạy ổn định, nên chuyển token vào Script Properties để an toàn hơn.

// LIFF Form giao việc
var LIFF_ID = "2010371497-R9x4l665";
var LIFF_URL = "https://liff.line.me/" + LIFF_ID;

// ==========================================
// 0. MENU TRÊN GOOGLE SHEET
// ==========================================
function onOpen() {
  // Tự động cấu hình LIFF ID của bạn vào hệ thống
  PropertiesService.getScriptProperties().setProperty('LIFF_ID', '2010371497-R9x4l665');
  
  var ui = SpreadsheetApp.getUi();
  ui.createMenu('🤖 LINE BOT')
      .addItem('1. Khởi tạo Bảng Dữ Liệu', 'SETUP_KHOI_TAO_HETHONG')
      .addItem('2. Dọn dẹp dòng rác/trống', 'XOA_DONG_RÁC')
      .addSeparator()
      .addItem('📸 3. Up Ảnh & Lấy Link', 'SHOW_UPLOAD_DIALOG')
      .addItem('📱 4. Mở Form Giao Việc (LINE LIFF)', 'OPEN_LIFF_FORM')
      .addItem('🔍 5. Chạy Quét Việc Thủ Công & Xem Log', 'CHAY_QUET_VIEC_THU_CONG')
      .addSeparator()
      .addItem('🧹 Làm sạch Sự kiện', 'LAM_SACH_SU_KIEN')
      .addItem('🧹 Làm sạch Tương tác', 'LAM_SACH_TUONG_TAC')
      .addSeparator()
      .addItem('🎛️ Tạo Rich Menu', 'SETUP_RICH_MENU')
      .addItem('🖼️ Upload ảnh Rich Menu', 'UPLOAD_RICH_MENU_IMAGE_FROM_DRIVE')
      .addItem('✅ Đặt Rich Menu mặc định', 'SET_DEFAULT_RICH_MENU')
      .addSeparator()
      .addItem('🧪 Test LIFF URL', 'TEST_LIFF_URL')
      .addToUi();
}

function SETUP_KHOI_TAO_HETHONG() {
  var ss = getSpreadsheet();
  var sheetsConfig = {
    "Sự kiện": ["Tên sự kiện", "Nội dung", "Ngày giờ gửi", "Link ảnh đính kèm", "Lặp lại", "Nhóm nhận", "Người phụ trách", "Tần suất (phút)", "Hình thức xác nhận", "Độ ưu tiên", "Người xác nhận", "Trạng thái", "Lần nhắc cuối", "Số lần nhắc", "Link Ảnh Nghiệm Thu", "Deadline", "Loại công việc", "Người giao việc", "Người theo dõi", "Ghi chú", "Trạng thái xử lý chi tiết", "Lịch sử cập nhật", "Đã nhắc trước deadline"],
    "ID_Group": ["Tên Group", "ID Group"],
    "ID_Member": ["Tên Line", "ID Line"],
    "Tương Tác": ["Ngày", "ID Group", "ID Line", "Tên Line", "Văn bản", "Sticker", "Ảnh", "Tổng"],
    "Chatbot": ["Từ khóa", "Văn bản trả lời", "Link ảnh Google Drive"],
    "Link_img": ["Tên Ảnh", "Link Trực Tiếp"]
  };

  for (var sheetName in sheetsConfig) {
    var sheet = ss.getSheetByName(sheetName);
    if (!sheet) {
      sheet = ss.insertSheet(sheetName);
    }
    var headers = sheetsConfig[sheetName];
    var range = sheet.getRange(1, 1, 1, headers.length);
    range.setValues([headers]);
    range.setFontWeight("bold").setBackground("#d9ead3"); 
    sheet.setFrozenRows(1);         
  }
  var defaultSheet = ss.getSheetByName("Trang tính1") || ss.getSheetByName("Sheet1");
  if (defaultSheet && ss.getSheets().length > 1) ss.deleteSheet(defaultSheet);
  
  // Tự động tạo trigger quét sự kiện nhắc việc mỗi phút
  taoTriggerQuetSuKien();
  
  SpreadsheetApp.getUi().alert("✅ Đã cập nhật hệ thống, cập nhật cấu hình cột và tự động kích hoạt Trình Nhắc Việc mỗi phút thành công!");
}

function taoTriggerQuetSuKien() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'checkAndSendLineMessage') {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }
  ScriptApp.newTrigger('checkAndSendLineMessage')
      .timeBased()
      .everyMinutes(1)
      .create();
}



// ==========================================
// TÍNH NĂNG 4: UP ẢNH VÀ LẤY LINK
// ==========================================
function SHOW_UPLOAD_DIALOG() {
  var html = HtmlService.createHtmlOutputFromFile('UploadUI').setWidth(500).setHeight(450).setSandboxMode(HtmlService.SandboxMode.IFRAME);
  SpreadsheetApp.getUi().showModalDialog(html, "📤 Tải ảnh lên hệ thống");
}

function processUpload(data, name) {
  var folderName = "BOT - LINE";
  var folders = DriveApp.getFoldersByName(folderName);
  var folder = folders.hasNext() ? folders.next() : DriveApp.createFolder(folderName);
  folder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

  var contentType = data.substring(5, data.indexOf(';'));
  var bytes = Utilities.base64Decode(data.split(',')[1]);
  var blob = Utilities.newBlob(bytes, contentType, name);
  var file = folder.createFile(blob);
  
  var fileId = file.getId();
  var directLink = "https://lh3.googleusercontent.com/d/" + fileId;

  var sheet = getSpreadsheet().getSheetByName("Link_img");
  if(sheet) sheet.appendRow([name, directLink]);
  
  return { name: name, link: directLink };
}

// ==========================================
// CÁC HÀM CŨ (NHẮC VIỆC, WEBHOOK, LƯU DỮ LIỆU...)
// ==========================================
function checkAndSendLineMessage() {
  writeLog("Bắt đầu quét sự kiện nhắc việc...", "INFO");
  try {
    var sheet = getSpreadsheet().getSheetByName("Sự kiện");
    if (!sheet) {
      writeLog("Không tìm thấy sheet 'Sự kiện'", "WARN");
      return;
    }
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) {
      writeLog("Không có sự kiện nào trong danh sách.", "INFO");
      return;
    }
    
    var lastCol = Math.max(sheet.getLastColumn() || 23, 23);
    var data = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues(); 
    var currentTime = new Date();
    var processedCount = 0;
    
    for (var i = 0; i < data.length; i++) {
      var row = data[i], rowIndex = i + 2; 
      
      // Bỏ qua dòng trống hoặc đã gửi/đã hủy
      if (String(row[0]).trim() === "") continue;
      var status = String(row[11] || "").trim();
      if (status === "Đã gửi" || status === "Đã hủy") continue;
      
      var tenSuKien = row[0];
      var idG = row[5];
      var idNV = row[6];
      var tanSuat = parseInt(row[7]) || 15;
      var hinhThucXN = String(row[8]).trim();
      var uuTien = row[9];
      
      writeLog("Đang xử lý sự kiện: '" + tenSuKien + "' (Dòng " + rowIndex + ")", "INFO");
      
      // Parse ngày giờ gửi
      var tgGui = convertToDate(row[2]);
      if (!tgGui) {
        writeLog("❌ Lỗi: Ngày giờ gửi không hợp lệ ở Dòng " + rowIndex + ": '" + row[2] + "'", "WARN");
        continue;
      }
      
      if (idG === "") {
        writeLog("⚠️ Lỗi: Không có ID Nhóm nhận ở Dòng " + rowIndex, "WARN");
        continue;
      }
      
      // Khởi tạo extraData từ các cột bổ sung
      var extraData = {
        deadline: row[15],
        loaiCV: row[16],
        nguoiGiao: row[17],
        nguoiTheoDoi: row[18],
        ghiChu: row[19],
        trangThaiChiTiet: status,
        lichSu: row[21],
        idNV: idNV,
        daNhacPreDeadline: row[22] // Cột 23 / Cột W
      };
      
      // 1. Kiểm tra QUÁ HẠN (Deadline)
      if (extraData.deadline) {
        var deadlineVal = convertToDate(extraData.deadline);
        if (deadlineVal && currentTime > deadlineVal && status !== "Quá hạn") {
          sheet.getRange(rowIndex, 12).setValue("Quá hạn");
          status = "Quá hạn";
          extraData.trangThaiChiTiet = "Quá hạn";
          
          var existingHistory = sheet.getRange(rowIndex, 22).getValue();
          var newHistory = "Hệ thống: Quá hạn hoàn thành lúc " + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "dd-MM-yyyy HH:mm");
          sheet.getRange(rowIndex, 22).setValue(existingHistory ? existingHistory + "\n" + newHistory : newHistory);
          
          var alertMsg = "⚠️ CẢNH BÁO QUÁ HẠN: Công việc '" + tenSuKien + "' đã quá hạn hoàn thành (Hạn: " + formatDateTimeDisplay(deadlineVal) + ")!";
          try {
            var tagStr = idNV;
            if (extraData.nguoiTheoDoi) {
              tagStr = tagStr ? tagStr + "," + extraData.nguoiTheoDoi : extraData.nguoiTheoDoi;
            }
            sendLinePush(idG, tenSuKien, alertMsg, "", "Không", rowIndex, tagStr, 3, "GẤP", extraData);
            writeLog("Gửi cảnh báo quá hạn công việc '" + tenSuKien + "' (Dòng " + rowIndex + ")", "INFO");
          } catch (alertErr) {
            writeLog("❌ Lỗi gửi cảnh báo quá hạn: " + alertErr.toString(), "ERROR");
          }
        }
      }
      
      // 2. Kiểm tra SẮP ĐẾN HẠN (Nhắc trước deadline 30 phút)
      if (extraData.deadline && status !== "Đã gửi" && status !== "Đã hủy" && status !== "Quá hạn") {
        var deadlineVal = convertToDate(extraData.deadline);
        if (deadlineVal) {
          var minsToDeadline = (deadlineVal.getTime() - currentTime.getTime()) / 60000;
          var daNhacPre = String(row[22] || "").trim(); // Cột W
          if (minsToDeadline > 0 && minsToDeadline <= 30 && daNhacPre !== "Có") {
            sheet.getRange(rowIndex, 23).setValue("Có");
            row[22] = "Có";
            extraData.daNhacPreDeadline = "Có";
            
            var warnMsg = "⏰ SẮP ĐẾN HẠN: Công việc '" + tenSuKien + "' sắp đến hạn hoàn thành vào lúc " + formatDateTimeDisplay(deadlineVal) + " (còn khoảng " + Math.round(minsToDeadline) + " phút)!";
            try {
              sendLinePush(idG, tenSuKien, warnMsg, "", "Không", rowIndex, idNV, 1, "Quan trọng", extraData);
              writeLog("Gửi nhắc sắp đến hạn công việc '" + tenSuKien + "' (Dòng " + rowIndex + ")", "INFO");
            } catch (warnErr) {
              writeLog("❌ Lỗi gửi nhắc sắp đến hạn: " + warnErr.toString(), "ERROR");
            }
          }
        }
      }
      
      // Kiểm tra đến giờ gửi chưa
      if (currentTime >= tgGui) {
        var hinhAnh = chuyenDoiLinkDrive(row[3]); 
        var lanNhacCuoi = convertToDate(row[12]) || new Date(0);
        var soLan = parseInt(row[13]) || 0;
        
        // Lấy thông tin Tên Nhóm và Tên Thành Viên để ghi log chi tiết
        var groupName = getGroupName(idG);
        var memberName = idNV ? resolveMemberNamesList(idNV, idG) : "Không có";
        
        if (hinhThucXN !== "Không" && hinhThucXN !== "") {
          var minsDiff = (currentTime - lanNhacCuoi) / 60000;
          if (minsDiff >= tanSuat || lanNhacCuoi.getTime() === 0) {
            soLan += 1;
            writeLog("Gửi tin nhắn nhắc việc: '" + tenSuKien + "' lần thứ " + soLan + " (Dòng " + rowIndex + ") | Nhóm: '" + groupName + "' | Phụ trách: '" + memberName + "'", "INFO");
            try {
              sendLinePush(idG, tenSuKien, row[1], hinhAnh, hinhThucXN, rowIndex, idNV, soLan, uuTien, extraData);
              var curStatus = sheet.getRange(rowIndex, 12).getValue();
              if (curStatus !== "Chờ gửi ảnh" && 
                  curStatus !== "Chờ gửi ảnh + ghi chú" && 
                  curStatus !== "Chờ ghi chú nghiệm thu" && 
                  curStatus !== "Cần hỗ trợ" && 
                  curStatus !== "Đang làm" && 
                  curStatus !== "Quá hạn") {
                sheet.getRange(rowIndex, 12).setValue("Chờ xác nhận");
              }
              sheet.getRange(rowIndex, 13).setValue(currentTime);
              sheet.getRange(rowIndex, 14).setValue(soLan);
              processedCount++;
            } catch (err) {
              writeLog("❌ Lỗi gửi LINE API (Dòng " + rowIndex + "): " + err.toString(), "ERROR");
            }
          } else {
            writeLog("Nhắc việc '" + tenSuKien + "' (Dòng " + rowIndex + ") đang chờ cách lần cuối " + Math.round(minsDiff) + " phút / tần suất " + tanSuat + " phút", "INFO");
          }
        } else if (hinhThucXN === "Không") {
          writeLog("Gửi tin nhắn thông báo (Không xác nhận): '" + tenSuKien + "' (Dòng " + rowIndex + ") | Nhóm: '" + groupName + "' | Phụ trách: '" + memberName + "'", "INFO");
          try {
            sendLinePush(idG, tenSuKien, row[1], hinhAnh, "Không", rowIndex, idNV, soLan, uuTien, extraData);
            sheet.getRange(rowIndex, 12).setValue("Đã gửi");
            processedCount++;
            
            // Xử lý lặp lại
            if (row[4] !== "Không" && row[4] !== "") {
              try {
                taoDongTiepTheo(sheet, rowIndex);
                writeLog("Đã tạo dòng lặp lại '" + row[4] + "' cho sự kiện '" + tenSuKien + "'", "INFO");
              } catch (repeatErr) {
                writeLog("❌ Lỗi khi tạo dòng lặp lại (Dòng " + rowIndex + "): " + repeatErr.toString(), "ERROR");
              }
            }
          } catch (err) {
            writeLog("❌ Lỗi gửi LINE API (Dòng " + rowIndex + "): " + err.toString(), "ERROR");
          }
        }
      } else {
        var diffSecs = Math.round((tgGui - currentTime) / 1000);
        writeLog("Sự kiện '" + tenSuKien + "' chưa tới giờ gửi. (Còn " + diffSecs + " giây)", "INFO");
      }
    }
    writeLog("Hoàn thành quét sự kiện. Số lượng tin đã xử lý: " + processedCount, "INFO");
  } catch (e) {
    writeLog("❌ Lỗi hệ thống trong checkAndSendLineMessage: " + e.toString(), "ERROR");
  }
}

function taoDongTiepTheo(sheet, rowIndex) {
  var lastCol = Math.max(sheet.getLastColumn() || 23, 23);
  var r = sheet.getRange(rowIndex, 1, 1, lastCol).getValues()[0];
  var d = convertToDate(r[2]);
  if (!d) {
    writeLog("⚠️ Lỗi lặp lại: Ngày giờ gốc không hợp lệ ở Dòng " + rowIndex + ": " + r[2], "ERROR");
    return;
  }
  
  var timeDiff = 0;
  var originalD = new Date(d.getTime());
  if (r[4] === "Hàng giờ") d.setHours(d.getHours() + 1);
  else if (r[4] === "Hàng ngày") d.setDate(d.getDate() + 1);
  else if (r[4] === "Hàng tuần") d.setDate(d.getDate() + 7);
  timeDiff = d.getTime() - originalD.getTime();

  var newData = [];
  for (var i = 0; i < r.length; i++) {
    newData.push(r[i]);
  }
  newData[2] = d;
  newData[10] = ""; // Người xác nhận
  newData[11] = ""; // Trạng thái
  newData[12] = ""; // Lần nhắc cuối
  newData[13] = ""; // Số lần nhắc
  newData[14] = ""; // Link Ảnh Nghiệm Thu
  
  // Shift deadline if present (column 16, i.e. index 15)
  if (newData[15]) {
    var deadlineD = convertToDate(newData[15]);
    if (deadlineD) {
      deadlineD.setTime(deadlineD.getTime() + timeDiff);
      newData[15] = deadlineD;
    }
  }
  
  if (newData.length > 20) {
    newData[20] = ""; // Trạng thái xử lý chi tiết
  }
  if (newData.length > 21) {
    newData[21] = ""; // Lịch sử cập nhật
  }
  if (newData.length > 22) {
    newData[22] = ""; // Đã nhắc trước deadline
  }
  
  ghiDuLieuThongMinh(sheet, newData);
}

function ghiDuLieuThongMinh(sheet, dataArray) {
  var colA = sheet.getRange("A:A").getValues();
  var insertRow = sheet.getLastRow() + 1;
  for (var i = 1; i < colA.length; i++) { if (String(colA[i][0]).trim() === "") { insertRow = i + 1; break; } }
  var lastCol = Math.max(dataArray.length, sheet.getLastColumn() || 15);
  sheet.getRange(insertRow, 1, 1, lastCol).clearContent();
  sheet.getRange(insertRow, 1, 1, dataArray.length).setValues([dataArray]);
}

function doPost(e) {
  try {
    var postData = JSON.parse(e.postData.contents);
    
    // Nếu là API request từ LIFF Form
    if (postData && postData.action === "createTask") {
      var result = createTaskFromLIFF(postData.data);
      return ContentService.createTextOutput(JSON.stringify(result))
          .setMimeType(ContentService.MimeType.JSON);
    }
    
    var events = postData.events;
    if (!events || events.length === 0) {
      return ContentService.createTextOutput(JSON.stringify({content: "ok"}))
          .setMimeType(ContentService.MimeType.JSON);
    }
    
    var ss = getSpreadsheet();
    for (var i = 0; i < events.length; i++) {
      var event = events[i];
      try {
        if (event.type === "message") {
          var uId = event.source.userId, gId = event.source.groupId, msgType = event.message.type;
          
          // Tự động đăng ký Thành viên / Nhóm
          var name = "Nhân viên";
          try {
            if (uId) {
              var sMem = ss.getSheetByName("ID_Member");
              var memValues = sMem.getDataRange().getValues();
              var existingRow = memValues.find(r => r[1] === uId);
              if (existingRow) {
                name = existingRow[0];
              } else {
                name = getUserName(uId, gId);
                sMem.appendRow([name, uId]); 
              }
            }
            if (gId) {
              var sG = ss.getSheetByName("ID_Group");
              if (!sG.getDataRange().getValues().some(r => r[1] === gId)) { 
                sG.appendRow([getGroupName(gId), gId]); 
              }
            }
          } catch (err) {
            writeLog("Lỗi đăng ký TV/Nhóm: " + err.toString(), "ERROR");
          }
          
          // Xử lý tin nhắn text ở cả chat riêng và nhóm
          if (msgType === "text") {
            var text = event.message.text.trim().toLowerCase();
            var originalText = event.message.text.trim();
            
            // Log webhook nhận text
            try {
              writeLog("Webhook text: " + text + " | userId=" + uId + " | groupId=" + gId, "INFO");
            } catch (err) {}
            
            // Kiểm tra phản hồi ghi chú nghiệm thu
            if (gId) {
              var sEv = ss.getSheetByName("Sự kiện");
              if (sEv) {
                var evData = sEv.getDataRange().getValues();
                var handledNote = false;
                for (var j = 1; j < evData.length; j++) {
                  if (evData[j][5] === gId && evData[j][11] === "Chờ ghi chú nghiệm thu" && evData[j][10] === name) {
                    sEv.getRange(j+1, 12).setValue("Đã gửi");
                    
                    var existingNote = sEv.getRange(j+1, 20).getValue();
                    var newNote = existingNote ? existingNote + "\nNghiệm thu: " + originalText : "Nghiệm thu: " + originalText;
                    sEv.getRange(j+1, 20).setValue(newNote);
                    
                    var existingHistory = sEv.getRange(j+1, 22).getValue();
                    var newHistory = "Hoàn tất bởi " + name + " lúc " + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "dd-MM-yyyy HH:mm") + "\nGhi chú: " + originalText;
                    sEv.getRange(j+1, 22).setValue(existingHistory ? existingHistory + "\n" + newHistory : newHistory);
                    
                    if (evData[j][4] !== "Không") taoDongTiepTheo(sEv, j+1);
                    sendLineReply(event.replyToken, "🎉 Nghiệm thu hoàn tất! Ghi chú nghiệm thu đã được lưu: \"" + originalText + "\"");
                    handledNote = true;
                    break;
                  }
                }
                if (handledNote) continue;
              }
            }
            
            // 1. Trợ giúp cú pháp
            if (["/help", "help"].indexOf(text) !== -1) {
              replyHelp(event.replyToken);
              continue;
            }
            
            // 2. Hướng dẫn / giới thiệu BOT
            if (["/hd", "/huongdan", "hướng dẫn", "huong dan"].indexOf(text) !== -1) {
              replyHuongDanBot(event.replyToken);
              continue;
            }
            
            // 3. Mở form giao việc
            if ([
              "/link", "/tao", "/do", "/gv",
              "/giao", "link", "tạo việc", "tao viec",
              "giao việc", "giao viec", "mở giao việc", "mo giao viec"
            ].indexOf(text) !== -1) {
              replyGiaoForm(event.replyToken);
              continue;
            }
            
            // 4. Tương tác hôm nay
            if ([
              "/tthomnay", "/tuongtac", "tương tác", "tuong tac",
              "tương tác hôm nay", "tuong tac hom nay",
              "/homnay", "hôm nay", "hom nay", "/tthn"
            ].indexOf(text) !== -1) {
              if (gId) {
                guiBaoCaoTuongTac(gId, event.replyToken, 1);
              } else {
                sendLineReply(event.replyToken, "📌 Lệnh này dùng tốt nhất trong nhóm. Vui lòng dùng trong nhóm cần xem tương tác.");
              }
              continue;
            }
            
            // 5. Tương tác 7 ngày
            if ([
              "/tt7ngay", "tương tác 7 ngày", "tuong tac 7 ngay",
              "/7ngay", "7 ngày", "7 ngay", "/ttt"
            ].indexOf(text) !== -1) {
              if (gId) {
                guiBaoCaoTuongTac(gId, event.replyToken, 7);
              } else {
                sendLineReply(event.replyToken, "📅 Lệnh này dùng tốt nhất trong nhóm. Vui lòng dùng trong nhóm cần xem tương tác 7 ngày.");
              }
              continue;
            }
            
            // 6. Lấy ID
            if (["/id", "id", "lấy id", "lay id"].indexOf(text) !== -1) {
              if (gId) {
                sendLineReply(event.replyToken, "🆔 Group ID:\n" + gId + "\n\n👤 User ID:\n" + uId);
              } else {
                sendLineReply(event.replyToken, "👤 User ID:\n" + uId);
              }
              continue;
            }
            
            // 7. Gửi ảnh hướng dẫn
            if (text === "/anh") {
              sendLineReply(event.replyToken, "📸 Khi công việc yêu cầu ảnh: bấm nút ‘Gửi ảnh nghiệm thu’, sau đó gửi ảnh trực tiếp trong nhóm này.");
              continue;
            }
            
            // 7. Tra cứu Chatbot
            var sChat = ss.getSheetByName("Chatbot");
            if (sChat) {
              var cData = sChat.getDataRange().getValues();
              var foundChatbot = false;
              for (var k = 1; k < cData.length; k++) {
                if (String(cData[k][0]).trim().toLowerCase() === text) {
                  sendBotReply(event.replyToken, cData[k][1], cData[k][2]);
                  foundChatbot = true;
                  break;
                }
              }
              if (foundChatbot) continue;
            }
          }
          
          // Xử lý ảnh nghiệm thu (Chỉ chạy trong nhóm)
          if (msgType === "image" && gId) {
            var sEv = ss.getSheetByName("Sự kiện");
            var evData = sEv.getDataRange().getValues();
            for (var j = 1; j < evData.length; j++) {
              if (evData[j][5] === gId && evData[j][10] === name) {
                var currentStatus = evData[j][11];
                if (currentStatus === "Chờ gửi ảnh") {
                  var imgUrl = luuAnhVaoDrive(event.message.id, name);
                  sEv.getRange(j+1, 12).setValue("Đã gửi"); 
                  sEv.getRange(j+1, 15).setValue(imgUrl);
                  
                  var history = "Nghiệm thu ảnh bởi " + name + " lúc " + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "dd-MM-yyyy HH:mm");
                  sEv.getRange(j+1, 22).setValue(history);
                  
                  if (evData[j][4] !== "Không") taoDongTiepTheo(sEv, j+1);
                  sendLineReply(event.replyToken, "📸 Đã nghiệm thu ảnh!"); 
                  break;
                } else if (currentStatus === "Chờ gửi ảnh + ghi chú") {
                  var imgUrl = luuAnhVaoDrive(event.message.id, name);
                  sEv.getRange(j+1, 12).setValue("Chờ ghi chú nghiệm thu"); 
                  sEv.getRange(j+1, 15).setValue(imgUrl);
                  
                  var history = "Đã gửi ảnh bởi " + name + " lúc " + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "dd-MM-yyyy HH:mm") + ". Đang chờ ghi chú.";
                  sEv.getRange(j+1, 22).setValue(history);
                  
                  sendLineReply(event.replyToken, "✅ Đã nhận ảnh nghiệm thu! Vui lòng gửi tiếp một tin nhắn văn bản làm Ghi chú nghiệm thu.");
                  break;
                }
              }
            }
          }
          
          // Cập nhật tương tác nhóm
          if (gId) {
            capNhatTuongTac(gId, uId, name, msgType);
          }
        }
        
        if (event.type === "postback") {
          var d = event.postback.data, rIdx = parseInt(d.split("&row=")[1]), sEv = ss.getSheetByName("Sự kiện");
          var uName = getUserName(event.source.userId, event.source.groupId);
          var currentStatus = sEv.getRange(rIdx, 12).getValue();
          if (currentStatus !== "Đã gửi" && currentStatus !== "Đã hủy") {
            if (d.includes("action=hoantat")) {
              sEv.getRange(rIdx, 11).setValue(uName); 
              sEv.getRange(rIdx, 12).setValue("Đã gửi");
              if (sEv.getRange(rIdx, 5).getValue() !== "Không") taoDongTiepTheo(sEv, rIdx);
              sendLineReply(event.replyToken, "🎉 " + uName + " đã xong!");
            } else if (d.includes("action=chupanh_ghichu")) {
              sEv.getRange(rIdx, 11).setValue(uName); 
              sEv.getRange(rIdx, 12).setValue("Chờ gửi ảnh + ghi chú");
              sendLineReply(event.replyToken, "📸 Mời bạn gửi ảnh nghiệm thu trước.");
            } else if (d.includes("action=chupanh")) {
              sEv.getRange(rIdx, 11).setValue(uName); 
              sEv.getRange(rIdx, 12).setValue("Chờ gửi ảnh");
              sendLineReply(event.replyToken, "📸 Mời bạn gửi ảnh!");
            } else if (d.includes("action=danglam")) {
              sEv.getRange(rIdx, 11).setValue(uName); 
              sEv.getRange(rIdx, 12).setValue("Đang làm");
              var existingHistory = sEv.getRange(rIdx, 22).getValue();
              var newHistory = uName + " bắt đầu làm lúc " + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "dd-MM-yyyy HH:mm");
              sEv.getRange(rIdx, 22).setValue(existingHistory ? existingHistory + "\n" + newHistory : newHistory);
              sendLineReply(event.replyToken, "⚡ " + uName + " đã nhận và bắt đầu thực hiện công việc!");
            } else if (d.includes("action=support")) {
              sEv.getRange(rIdx, 12).setValue("Cần hỗ trợ");
              var existingHistory = sEv.getRange(rIdx, 22).getValue();
              var newHistory = uName + " báo cần hỗ trợ lúc " + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "dd-MM-yyyy HH:mm");
              sEv.getRange(rIdx, 22).setValue(existingHistory ? existingHistory + "\n" + newHistory : newHistory);
              var taskName = sEv.getRange(rIdx, 1).getValue();
              var alertMsg = "🆘 CẦN HỖ TRỢ: " + uName + " cần hỗ trợ thực hiện công việc '" + taskName + "'!";
              sendLineReply(event.replyToken, alertMsg);
            } else if (d.includes("action=delay")) {
              var now = new Date();
              var newTime = new Date();
              var delayText = "";
              if (d.includes("mins=15")) {
                newTime.setTime(now.getTime() + 15 * 60 * 1000);
                delayText = "dời 15 phút";
              } else if (d.includes("mins=30")) {
                newTime.setTime(now.getTime() + 30 * 60 * 1000);
                delayText = "dời 30 phút";
              } else if (d.includes("mins=tomorrow")) {
                newTime.setDate(now.getDate() + 1);
                newTime.setHours(8, 0, 0, 0);
                delayText = "dời sang sáng mai (08:00)";
              }
              sEv.getRange(rIdx, 3).setValue(newTime);
              sEv.getRange(rIdx, 12).setValue("Chờ xác nhận");
              sEv.getRange(rIdx, 13).setValue("");
              sEv.getRange(rIdx, 14).setValue(0);
              var existingHistory = sEv.getRange(rIdx, 22).getValue();
              var newHistory = uName + " đã dời việc (" + delayText + ") lúc " + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "dd-MM-yyyy HH:mm");
              sEv.getRange(rIdx, 22).setValue(existingHistory ? existingHistory + "\n" + newHistory : newHistory);
              var taskName = sEv.getRange(rIdx, 1).getValue();
              var replyMsg = "🕒 " + uName + " đã dời công việc '" + taskName + "' (" + delayText + ").\nThời gian nhắc mới: " + formatDateTimeDisplay(newTime);
              sendLineReply(event.replyToken, replyMsg);
            }
          }
        }
      } catch (errEvent) {
        try {
          writeLog("Lỗi xử lý sự kiện: " + errEvent.toString(), "ERROR");
        } catch (e) {}
      }
    }
    return ContentService.createTextOutput(JSON.stringify({content: "ok"}))
        .setMimeType(ContentService.MimeType.JSON);
  } catch (errGlobal) {
    try {
      writeLog("Lỗi toàn cục doPost: " + errGlobal.toString(), "ERROR");
    } catch (e) {}
    return ContentService.createTextOutput(JSON.stringify({content: "error", message: errGlobal.toString()}))
        .setMimeType(ContentService.MimeType.JSON);
  }
}

function getGroupName(groupId) {
  try { return JSON.parse(UrlFetchApp.fetch("https://api.line.me/v2/bot/group/" + groupId + "/summary", { "headers": { "Authorization": "Bearer " + TOKEN } }).getContentText()).groupName; } catch (e) { return "Nhóm cũ"; }
}

function luuAnhVaoDrive(messageId, userName) {
  var res = UrlFetchApp.fetch("https://api-data.line.me/v2/bot/message/" + messageId + "/content", { "headers": { "Authorization": "Bearer " + TOKEN } });
  var folder = DriveApp.getFoldersByName("Ảnh Nghiệm Thu BOT").hasNext() ? DriveApp.getFoldersByName("Ảnh Nghiệm Thu BOT").next() : DriveApp.createFolder("Ảnh Nghiệm Thu BOT");
  folder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return folder.createFile(res.getBlob().setName(userName + "_" + new Date().getTime() + ".jpg")).getUrl();
}

function chuyenDoiLinkDrive(url) {
  if (!url) return "";
  var match = String(url).match(/\/d\/([a-zA-Z0-9_-]+)/) || String(url).match(/id=([a-zA-Z0-9_-]+)/);
  return match ? "https://lh3.googleusercontent.com/d/" + match[1] : url; 
}

function sendBotReply(token, txt, imgUrl) {
  var msgs = [];
  if (txt) msgs.push({ type: "text", text: String(txt) });
  if (imgUrl) {
    var dl = chuyenDoiLinkDrive(imgUrl);
    msgs.push({
      type: "image",
      originalContentUrl: dl,
      previewImageUrl: dl
    });
  }

  if (msgs.length === 0) {
    msgs.push({ type: "text", text: "Bot chưa có nội dung trả lời cho từ khóa này." });
  }

  replyMessages(token, msgs, "LINE chatbot reply");
}


// ==========================================
// HÀM GỬI LINE & FIX LỖI TAG ĐÍCH DANH (CẬP NHẬT MỚI NHẤT)
// ==========================================
function sendLinePush(to, ten, noiDung, img, hinhThucXN, rIdx, tagId, soLan, uuTien, extraData) {
  var msgs = [];
  
  // 1. Xử lý Ảnh
  var cleanImg = String(img).trim();
  if (cleanImg !== "" && cleanImg.startsWith("http")) {
    msgs.push({"type": "image", "originalContentUrl": cleanImg, "previewImageUrl": cleanImg});
  }
  
  // 2. Xử lý Tag đích danh (Sử dụng tin nhắn textV2 với substitution hỗ trợ đa thành viên)
  var alertTxt = "";
  if (noiDung.indexOf("SẮP ĐẾN HẠN") !== -1) {
    alertTxt = "⏰ Sắp đến hạn: " + ten;
  } else if (noiDung.indexOf("CẢNH BÁO QUÁ HẠN") !== -1) {
    alertTxt = "🚨 QUÁ HẠN / CẦN QUẢN LÝ THEO DÕI: " + ten;
  } else if (soLan >= 3) {
    alertTxt = "🚨 QUÁ HẠN / CẦN QUẢN LÝ THEO DÕI: Công việc '" + ten + "' chưa hoàn thành!";
  } else if (soLan === 2) {
    alertTxt = "🔔 Nhắc lại: Công việc '" + ten + "' chưa hoàn thành!";
  } else {
    alertTxt = "🔔 Bạn có công việc mới: " + ten;
  }

  var cleanTagId = String(tagId || "").trim();
  if (soLan >= 3 && extraData && extraData.nguoiTheoDoi) {
    var followers = String(extraData.nguoiTheoDoi).trim();
    if (followers !== "") {
      cleanTagId = cleanTagId ? cleanTagId + "," + followers : followers;
    }
  }

  var cleanTagIds = cleanTagId.split(",").map(function(s) { return s.trim(); }).filter(function(id) {
    return /^U[a-fA-F0-9]{32}$/.test(id);
  });

  if (cleanTagIds.length > 0) {
    var textParts = [];
    var substitution = {};
    cleanTagIds.forEach(function(id, idx) {
      var key = "m_" + (idx + 1);
      textParts.push("{" + key + "}");
      substitution[key] = {
        "type": "mention",
        "mentionee": {
          "type": "user",
          "userId": id
        }
      };
    });
    msgs.push({
      "type": "textV2",
      "text": textParts.join(" ") + " " + alertTxt,
      "substitution": substitution
    });
  } else {
    msgs.push({ "type": "text", "text": alertTxt });
  }

  // 3. Xử lý Thẻ Công việc (Flex Message nâng cấp)
  msgs.push(buildTaskFlexMessage(ten, noiDung, hinhThucXN, rIdx, soLan, uuTien, extraData));
  
  // Gửi API với Log chi tiết
  var payload = { "to": to, "messages": msgs };
  var res = UrlFetchApp.fetch("https://api.line.me/v2/bot/message/push", {
    method: "post",
    headers: {
      Authorization: "Bearer " + TOKEN,
      "Content-Type": "application/json"
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });

  var code = res.getResponseCode();
  var body = res.getContentText();
  writeLog("LINE push response: " + code + " | " + body, code >= 200 && code < 300 ? "INFO" : "ERROR");

  if (code < 200 || code >= 300) {
    throw new Error("LINE API lỗi " + code + ": " + body);
  }
}

function buildTaskFlexMessage(ten, noiDung, hinhThucXN, rIdx, soLan, uuTien, extraData) {
  var currentStatus = extraData ? String(extraData.trangThaiChiTiet || "").trim() : "";
  var isOverdue = currentStatus === "Quá hạn";
  var isSupport = currentStatus === "Cần hỗ trợ";
  
  var isUrgent = String(uuTien).trim() === "GẤP";
  var isImportant = String(uuTien).trim() === "Quan trọng";
  
  var colorTheme = isOverdue ? "#EF4444" : (isSupport ? "#F59E0B" : (isUrgent ? "#FF334B" : (isImportant ? "#F59E0B" : "#1DB446")));
  var badgeText = isOverdue ? "QUÁ HẠN" : (isSupport ? "CẦN HỖ TRỢ" : (isUrgent ? "GẤP" : (isImportant ? "QUAN TRỌNG" : "NHẮC VIỆC")));
  var titleText = String(ten || "Công việc mới").trim();
  var bodyText = String(noiDung || "Không có nội dung chi tiết").trim();

  var fields = [];
  
  // 1. Phụ trách (Hiển thị tên người phụ trách)
  var assignees = "";
  if (extraData && extraData.idNV) {
    assignees = resolveMemberNamesList(extraData.idNV);
  } else {
    assignees = "Chưa phân công";
  }
  fields.push({
    type: "box",
    layout: "baseline",
    contents: [
      { type: "text", text: "Phụ trách", size: "xs", color: "#888888", flex: 2 },
      { type: "text", text: assignees, size: "xs", color: "#333333", flex: 4, wrap: true, weight: "bold" }
    ]
  });

  // 2. Deadline
  if (extraData && extraData.deadline) {
    fields.push({
      type: "box",
      layout: "baseline",
      contents: [
        { type: "text", text: "Deadline", size: "xs", color: "#888888", flex: 2 },
        { type: "text", text: formatDateTimeDisplay(extraData.deadline), size: "xs", color: "#D32F2F", flex: 4, wrap: true, weight: "bold" }
      ]
    });
  }

  // 3. Loại công việc
  if (extraData && extraData.loaiCV && extraData.loaiCV !== "Khác") {
    fields.push({
      type: "box",
      layout: "baseline",
      contents: [
        { type: "text", text: "Loại CV", size: "xs", color: "#888888", flex: 2 },
        { type: "text", text: extraData.loaiCV, size: "xs", color: "#333333", flex: 4, wrap: true }
      ]
    });
  }

  // 4. Người giao việc
  if (extraData && extraData.nguoiGiao) {
    fields.push({
      type: "box",
      layout: "baseline",
      contents: [
        { type: "text", text: "Người giao", size: "xs", color: "#888888", flex: 2 },
        { type: "text", text: resolveMemberName(extraData.nguoiGiao), size: "xs", color: "#333333", flex: 4, wrap: true }
      ]
    });
  }

  // 5. Người theo dõi
  if (extraData && extraData.nguoiTheoDoi) {
    var followersText = resolveMemberNamesList(extraData.nguoiTheoDoi);
    if (followersText !== "Không có") {
      fields.push({
        type: "box",
        layout: "baseline",
        contents: [
          { type: "text", text: "Theo dõi", size: "xs", color: "#888888", flex: 2 },
          { type: "text", text: followersText, size: "xs", color: "#555555", flex: 4, wrap: true }
        ]
      });
    }
  }

  // 6. Xác nhận
  fields.push({
    type: "box",
    layout: "baseline",
    contents: [
      { type: "text", text: "Xác nhận", size: "xs", color: "#888888", flex: 2 },
      { type: "text", text: String(hinhThucXN || "Không"), size: "xs", color: "#333333", flex: 4, wrap: true }
    ]
  });

  // 7. Lần nhắc
  fields.push({
    type: "box",
    layout: "baseline",
    contents: [
      { type: "text", text: "Lần nhắc", size: "xs", color: "#888888", flex: 2 },
      { type: "text", text: String(soLan || 1), size: "xs", color: "#333333", flex: 4 }
    ]
  });

  // 8. Ghi chú thêm
  if (extraData && extraData.ghiChu) {
    fields.push({
      type: "box",
      layout: "baseline",
      contents: [
        { type: "text", text: "Ghi chú", size: "xs", color: "#888888", flex: 2 },
        { type: "text", text: extraData.ghiChu, size: "xs", color: "#555555", flex: 4, wrap: true, style: "italic" }
      ]
    });
  }

  var bubble = {
    type: "bubble",
    size: "mega",
    header: {
      type: "box",
      layout: "vertical",
      paddingAll: "14px",
      backgroundColor: colorTheme,
      contents: [
        {
          type: "text",
          text: badgeText,
          size: "xs",
          color: "#FFFFFF",
          weight: "bold"
        },
        {
          type: "text",
          text: titleText,
          size: "md",
          color: "#FFFFFF",
          weight: "bold",
          wrap: true,
          margin: "sm"
        }
      ]
    },
    body: {
      type: "box",
      layout: "vertical",
      spacing: "md",
      paddingAll: "16px",
      contents: [
        {
          type: "text",
          text: bodyText,
          size: "sm",
          color: "#333333",
          wrap: true
        },
        {
          type: "separator",
          margin: "md"
        },
        {
          type: "box",
          layout: "vertical",
          spacing: "sm",
          margin: "md",
          contents: fields
        }
      ]
    }
  };

  var footerContents = [];

  // Primary Action Button (Hoàn tất, Gửi ảnh, Gửi ảnh + ghi chú)
  if (hinhThucXN === "Bấm nút" || hinhThucXN === "Có") {
    footerContents.push({
      type: "button",
      style: "primary",
      color: colorTheme,
      height: "sm",
      action: {
        type: "postback",
        label: "Hoàn tất",
        data: "action=hoantat&row=" + rIdx
      }
    });
  } else if (hinhThucXN === "Gửi ảnh") {
    footerContents.push({
      type: "button",
      style: "primary",
      color: "#FF9900",
      height: "sm",
      action: {
        type: "postback",
        label: "📸 Gửi ảnh nghiệm thu",
        data: "action=chupanh&row=" + rIdx
      }
    });
  } else if (hinhThucXN === "Gửi ảnh + ghi chú") {
    footerContents.push({
      type: "button",
      style: "primary",
      color: "#FF9900",
      height: "sm",
      action: {
        type: "postback",
        label: "📸 Gửi ảnh + ghi chú",
        data: "action=chupanh_ghichu&row=" + rIdx
      }
    });
  }

  // Thêm nút "Bắt đầu làm" nếu trạng thái chưa là Đang làm và chưa hoàn tất
  if (currentStatus === "Chờ xác nhận" || currentStatus === "Chưa gửi" || currentStatus === "") {
    footerContents.push({
      type: "button",
      style: "primary",
      color: "#3B82F6",
      height: "sm",
      margin: "sm",
      action: {
        type: "postback",
        label: "⚡ Bắt đầu làm",
        data: "action=danglam&row=" + rIdx
      }
    });
  }

  // Thêm nút "Cần hỗ trợ" nếu chưa ở trạng thái "Cần hỗ trợ"
  if (currentStatus !== "Cần hỗ trợ") {
    footerContents.push({
      type: "button",
      style: "secondary",
      color: "#EF4444",
      height: "sm",
      margin: "sm",
      action: {
        type: "postback",
        label: "🚨 Cần hỗ trợ",
        data: "action=support&row=" + rIdx
      }
    });
  }

  // Thêm các nút Delay ngang: "🕒 Dời 15m", "🕒 Dời 30m", "🕒 Sáng mai"
  footerContents.push({
    type: "box",
    layout: "horizontal",
    margin: "md",
    spacing: "sm",
    contents: [
      {
        type: "button",
        style: "secondary",
        color: "#4B5563",
        height: "xs",
        action: {
          type: "postback",
          label: "🕒 Dời 15m",
          data: "action=delay&mins=15&row=" + rIdx
        }
      },
      {
        type: "button",
        style: "secondary",
        color: "#4B5563",
        height: "xs",
        action: {
          type: "postback",
          label: "🕒 Dời 30m",
          data: "action=delay&mins=30&row=" + rIdx
        }
      },
      {
        type: "button",
        style: "secondary",
        color: "#4B5563",
        height: "xs",
        action: {
          type: "postback",
          label: "🕒 Sáng mai",
          data: "action=delay&mins=tomorrow&row=" + rIdx
        }
      }
    ]
  });

  bubble.footer = {
    type: "box",
    layout: "vertical",
    paddingAll: "12px",
    contents: footerContents
  };

  return {
    type: "flex",
    altText: titleText,
    contents: bubble
  };
}


function replyMessages(token, messages, logName) {
  if (!token) {
    writeLog("Không có replyToken, không thể reply.", "ERROR");
    return;
  }

  var payload = {
    replyToken: token,
    messages: messages
  };

  var res = UrlFetchApp.fetch("https://api.line.me/v2/bot/message/reply", {
    method: "post",
    headers: {
      Authorization: "Bearer " + TOKEN,
      "Content-Type": "application/json"
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });

  var code = res.getResponseCode();
  var body = res.getContentText();
  writeLog((logName || "LINE reply") + " response: " + code + " | " + body, code >= 200 && code < 300 ? "INFO" : "ERROR");

  if (code < 200 || code >= 300) {
    throw new Error("LINE reply lỗi " + code + ": " + body);
  }
}

function sendLinePush_Simple(to, txt) {
  try {
    var res = UrlFetchApp.fetch("https://api.line.me/v2/bot/message/push", {
      "method": "post",
      "headers": {
        "Authorization": "Bearer " + TOKEN,
        "Content-Type": "application/json"
      },
      "payload": JSON.stringify({
        "to": to,
        "messages": [{"type": "text", "text": txt}]
      }),
      muteHttpExceptions: true
    });
    var code = res.getResponseCode();
    var body = res.getContentText();
    writeLog("LINE push simple response: " + code + " | " + body, code >= 200 && code < 300 ? "INFO" : "ERROR");
  } catch (e) {
    writeLog("❌ Lỗi sendLinePush_Simple: " + e.toString(), "ERROR");
  }
}
function sendLineReply(token, txt) {
  replyMessages(token, [{ type: "text", text: String(txt || "") }], "LINE text reply");
}

function getUserName(uId, gId) { try { var url = gId ? "https://api.line.me/v2/bot/group/" + gId + "/member/" + uId : "https://api.line.me/v2/bot/profile/" + uId; return JSON.parse(UrlFetchApp.fetch(url, {"headers": {"Authorization": "Bearer " + TOKEN}})).displayName; } catch (e) { return "Nhân viên"; } }

function resolveMemberName(uId, gId) {
  if (!uId) return "";
  uId = String(uId).trim();
  if (uId === "") return "";
  if (!/^U[a-fA-F0-9]{32}$/.test(uId)) {
    return uId;
  }
  try {
    var ss = getSpreadsheet();
    var sMem = ss.getSheetByName("ID_Member");
    if (sMem) {
      var memValues = sMem.getDataRange().getValues();
      for (var i = 1; i < memValues.length; i++) {
        if (String(memValues[i][1]).trim() === uId) {
          return memValues[i][0];
        }
      }
    }
  } catch (sheetErr) {
    writeLog("Error reading ID_Member in resolveMemberName: " + sheetErr.toString(), "WARN");
  }
  var name = getUserName(uId, gId);
  try {
    var ss = getSpreadsheet();
    var sMem = ss.getSheetByName("ID_Member");
    if (sMem) {
      sMem.appendRow([name, uId]);
    }
  } catch (cacheErr) {
    writeLog("Error caching ID_Member: " + cacheErr.toString(), "WARN");
  }
  return name;
}

function resolveMemberNamesList(idsStr, groupId) {
  if (!idsStr) return "Không có";
  var ids = String(idsStr).split(",").map(function(s) { return s.trim(); }).filter(Boolean);
  if (ids.length === 0) return "Không có";
  var names = ids.map(function(id) {
    return resolveMemberName(id, groupId);
  });
  return names.join(", ");
}

function formatDateTimeDisplay(dateOrStr) {
  if (!dateOrStr) return "Không có";
  var d = dateOrStr;
  if (typeof d === "string") {
    d = convertToDate(d);
  }
  if (!d || isNaN(d.getTime())) return String(dateOrStr);
  try {
    return Utilities.formatDate(d, Session.getScriptTimeZone(), "dd-MM-yyyy HH:mm");
  } catch (e) {
    return String(dateOrStr);
  }
}

function capNhatTuongTac(gId, uId, name, type) {
  var s = getSpreadsheet().getSheetByName("Tương Tác"), today = new Date().toDateString();
  var d = s.getDataRange().getValues(), rIdx = -1;
  for (var i = 1; i < d.length; i++) { if (d[i][0] === today && d[i][1] === gId && d[i][2] === uId) { rIdx = i + 1; break; } }
  var v = (type === "text") ? 1 : 0, st = (type === "sticker") ? 1 : 0, im = (type === "image") ? 1 : 0;
  if (rIdx === -1) s.appendRow([today, gId, uId, name, v, st, im, 1]);
  else { var r = d[rIdx-1]; s.getRange(rIdx, 5, 1, 4).setValues([[r[4]+v, r[5]+st, r[6]+im, r[7]+1]]); }
}

function guiBaoCaoTuongTac(gId, token, days) {
  var s = getSpreadsheet().getSheetByName("Tương Tác"), d = s.getDataRange().getValues(), stats = {};
  var start = new Date().getTime() - (days - 1) * 24 * 60 * 60 * 1000;
  for (var i = 1; i < d.length; i++) { if (d[i][1] === gId && new Date(d[i][0]).getTime() >= start) { var id = d[i][2]; if (!stats[id]) stats[id] = { n: d[i][3], v: 0, s: 0, i: 0, t: 0 }; stats[id].v += d[i][4]; stats[id].s += d[i][5]; stats[id].i += d[i][6]; stats[id].t += d[i][7]; } }
  var arr = Object.keys(stats).map(k => stats[k]).sort((a,b) => b.t - a.t);
  if (arr.length === 0) { sendLineReply(token, "Chưa có dữ liệu."); return; }
  var rep = "📊 TƯƠNG TÁC (" + (days===1?"HÔM NAY":"TUẦN") + ")\nName | T | S | I | Tổng\n";
  arr.forEach(r => { rep += r.n.substring(0,8) + " | " + r.v + " | " + r.s + " | " + r.i + " | " + r.t + "\n"; });
  sendLineReply(token, rep);
}



function layId(sN, name) {
  if (!name || String(name).includes("Chưa có")) return "";
  var d = getSpreadsheet().getSheetByName(sN).getDataRange().getValues(), sn = String(name).trim().toLowerCase().replace(/\s+/g, ' '); 
  for(var i=0; i<d.length; i++) { if(String(d[i][0]).trim().toLowerCase().replace(/\s+/g, ' ') === sn) return d[i][1]; }
  return "";
}

function LAM_SACH_SU_KIEN() { 
  var ss = getSpreadsheet();
  var s = ss.getSheetByName("Sự kiện"); 
  if (!s) { SpreadsheetApp.getUi().alert("❌ Không tìm thấy sheet 'Sự kiện'"); return; }
  if (s.getLastRow() > 1) s.getRange(2,1,s.getLastRow()-1,s.getLastColumn()).clearContent(); 
  SpreadsheetApp.getUi().alert("✅ Đã làm sạch toàn bộ dữ liệu trong sheet Sự kiện!");
}

function LAM_SACH_TUONG_TAC() { 
  var ss = getSpreadsheet();
  var s = ss.getSheetByName("Tương Tác") || ss.getSheetByName("Tương tác") || ss.getSheetByName("TuongTac"); 
  if (!s) { SpreadsheetApp.getUi().alert("❌ Không tìm thấy sheet 'Tương Tác'!"); return; }
  if (s.getLastRow() > 1) s.getRange(2,1,s.getLastRow()-1,s.getLastColumn()).clearContent(); 
  SpreadsheetApp.getUi().alert("✅ Đã làm sạch toàn bộ dữ liệu trong sheet Tương tác!");
}

function XOA_DONG_RÁC() { 
  var ss = getSpreadsheet();
  var s = ss.getSheetByName("Sự kiện"); 
  if (!s) return;
  var maxRows = s.getMaxRows();
  if (maxRows <= 1) { SpreadsheetApp.getUi().alert("🧹 Sheet Sự kiện sạch sẽ!"); return; }
  var d = s.getRange(1, 1, maxRows, 1).getValues(); 
  var count = 0; var numEmpty = 0;
  for (var i = maxRows - 1; i >= 1; i--) { 
    if (String(d[i][0]).trim() === "") { numEmpty++; } 
    else { if (numEmpty > 0) { s.deleteRows(i + 2, numEmpty); count += numEmpty; numEmpty = 0; } }
  }
  if (numEmpty > 0) { s.deleteRows(2, numEmpty); count += numEmpty; }
  if (count > 0) { s.insertRowAfter(s.getMaxRows()); SpreadsheetApp.getUi().alert("⚡ Đã dọn dẹp SIÊU TỐC " + count + " dòng rác!"); } 
  else { SpreadsheetApp.getUi().alert("🧹 Sheet Sự kiện đã sạch sẽ!"); }
}

// ==========================================
// TÍNH NĂNG LIFF: WEB APP GIAO VIỆC
// ==========================================
function doGet(e) {
  // Bỏ qua iframe sandbox, nếu gọi API lấy danh sách
  if (e && e.parameter && e.parameter.action === "getLists") {
    var data = getFormDataLists();
    return ContentService.createTextOutput(JSON.stringify(data))
        .setMimeType(ContentService.MimeType.JSON);
  }
  
  var template = HtmlService.createTemplateFromFile('liff');
  // Truyền URL Web App động vào template
  try {
    template.webAppUrl = ScriptApp.getService().getUrl();
  } catch(err) {
    template.webAppUrl = "";
  }
  
  return template.evaluate()
      .setTitle('📝 Giao Việc Nhanh - LINE BOT')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function getSpreadsheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (ss) {
    // Tự động lưu trữ ID Spreadsheet khi có context
    PropertiesService.getScriptProperties().setProperty('SPREADSHEET_ID', ss.getId());
    return ss;
  }
  
  var ssId = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  if (ssId) {
    try {
      return SpreadsheetApp.openById(ssId);
    } catch(e) {}
  }
  
  throw new Error("Không thể kết nối với Spreadsheet. Vui lòng mở Google Sheet và bấm chạy Menu '1. Khởi tạo Bảng Dữ Liệu' trước.");
}

function getFormDataLists() {
  var ss = getSpreadsheet();
  
  // Lấy danh sách nhóm
  var sGroup = ss.getSheetByName("ID_Group");
  var groups = [];
  if (sGroup && sGroup.getLastRow() > 1) {
    var gData = sGroup.getRange(2, 1, sGroup.getLastRow() - 1, 2).getValues();
    gData.forEach(function(row) {
      if (String(row[0]).trim() !== "") {
        groups.push({ name: row[0], id: row[1] });
      }
    });
  }
  
  // Lấy danh sách thành viên
  var sMember = ss.getSheetByName("ID_Member");
  var members = [];
  if (sMember && sMember.getLastRow() > 1) {
    var mData = sMember.getRange(2, 1, sMember.getLastRow() - 1, 2).getValues();
    mData.forEach(function(row) {
      if (String(row[0]).trim() !== "") {
        members.push({ name: row[0], id: row[1] });
      }
    });
  }
  
  return { groups: groups, members: members };
}

function createTaskFromLIFF(data) {
  try {
    var ss = getSpreadsheet();
    var sheetEvent = ss.getSheetByName("Sự kiện");
    if (!sheetEvent) return { success: false, message: "Không tìm thấy sheet 'Sự kiện'!" };
    
    var ten = String(data.ten || "").trim();
    var nd = String(data.noiDung || "").trim();
    var tgStr = String(data.ngayGio || "").trim();
    var la = String(data.linkAnh || "").trim();
    if (data.imageFile && data.imageFile.dataUrl) {
      la = saveLiffImageToDrive(data.imageFile);
    }
    var ll = String(data.lapLai || "Không").trim();
    var idG = String(data.idGroup || "").trim();
    var idNV = String(data.idMember || "").trim(); // Comma-separated list of assignee IDs
    var ts = parseInt(data.tanSuat, 10) || 15;
    var ht = String(data.hinhThucXN || "Không").trim(); // Form verification requirement
    var ut = String(data.doUuTien || "Bình thường").trim(); // Priority
    
    // New fields
    var deadlineStr = String(data.deadline || "").trim();
    var loaiCV = String(data.loaiCV || "Khác").trim();
    var nguoiGiao = String(data.idAssigner || "").trim();
    var nguoiTheoDoi = String(data.idFollower || "").trim();
    var ghiChu = String(data.ghiChu || "").trim();
    
    if (ten === "") return { success: false, message: "Tên sự kiện không được để trống!" };
    if (idG === "") return { success: false, message: "Vui lòng chọn Nhóm nhận!" };
    if (tgStr === "") return { success: false, message: "Vui lòng chọn Ngày giờ gửi!" };
    
    var dateVal = convertToDate(tgStr);
    if (!dateVal) return { success: false, message: "Ngày giờ gửi không hợp lệ!" };
    
    var deadlineVal = deadlineStr ? convertToDate(deadlineStr) : dateVal;
    if (!deadlineVal) deadlineVal = dateVal;
    
    // Ghi dữ liệu vào sheet Sự kiện (23 columns)
    var rowData = [
      ten,          // 1. Tên sự kiện
      nd,           // 2. Nội dung
      dateVal,      // 3. Ngày giờ gửi
      la,           // 4. Link ảnh đính kèm
      ll,           // 5. Lặp lại
      idG,          // 6. Nhóm nhận
      idNV,         // 7. Người phụ trách
      ts,           // 8. Tần suất (phút)
      ht,           // 9. Hình thức xác nhận
      ut,           // 10. Độ ưu tiên
      "",           // 11. Người xác nhận
      "",           // 12. Trạng thái
      "",           // 13. Lần nhắc cuối
      "",           // 14. Số lần nhắc
      "",           // 15. Link Ảnh Nghiệm Thu
      deadlineVal,  // 16. Deadline
      loaiCV,       // 17. Loại công việc
      nguoiGiao,    // 18. Người giao việc
      nguoiTheoDoi, // 19. Người theo dõi
      ghiChu,       // 20. Ghi chú
      "",           // 21. Trạng thái xử lý chi tiết
      "",           // 22. Lịch sử cập nhật
      ""            // 23. Đã nhắc trước deadline
    ];
    ghiDuLieuThongMinh(sheetEvent, rowData);
    
    // Gửi ngay nếu công việc đã tới giờ, không cần chờ trigger 1 phút.
    checkAndSendLineMessage();
    
    return { success: true, message: "Đã tạo công việc và đã kiểm tra gửi LINE!" };
  } catch (e) {
    return { success: false, message: "Lỗi hệ thống: " + e.toString() };
  }
}

function OPEN_LIFF_FORM() {
  var url = LIFF_URL;
  var html = HtmlService.createHtmlOutput('<script>window.open("' + url + '", "_blank");google.script.host.close();</script>').setWidth(300).setHeight(100);
  SpreadsheetApp.getUi().showModalDialog(html, "🚀 Đang mở Form LIFF...");
}

// ==========================================
// HÀM HỖ TRỢ GHI LOG & PHÂN TÍCH NGÀY THÁNG MỚI
// ==========================================

function writeLog(message, type) {
  try {
    var ss = getSpreadsheet();
    var sheet = ss.getSheetByName("Logs");
    if (!sheet) {
      sheet = ss.insertSheet("Logs");
      sheet.appendRow(["Thời gian", "Loại", "Nội dung log"]);
      sheet.getRange(1, 1, 1, 3).setFontWeight("bold").setBackground("#d9ead3");
      sheet.setFrozenRows(1);
    }
    
    type = type || "INFO";
    var timeStr = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm:ss");
    sheet.appendRow([timeStr, type, message]);
    
    // Giới hạn 1000 dòng log
    var lastRow = sheet.getLastRow();
    if (lastRow > 1000) {
      sheet.deleteRows(2, lastRow - 1000);
    }
  } catch (e) {
    Logger.log("Lỗi ghi log: " + e.toString());
  }
}

function convertToDate(dateVal) {
  if (!dateVal) return null;
  if (dateVal instanceof Date) {
    if (!isNaN(dateVal.getTime())) return dateVal;
    return null;
  }
  
  var str = String(dateVal).trim();
  if (str === "") return null;
  
  // 1. Thử phân tích chuẩn bằng Date API
  var d = new Date(str);
  if (!isNaN(d.getTime())) return d;
  
  // 2. Thử phân tích định dạng dd/mm/yyyy hh:mm:ss hoặc tương tự
  var matchDMY = str.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?$/);
  if (matchDMY) {
    var day = parseInt(matchDMY[1], 10);
    var month = parseInt(matchDMY[2], 10) - 1; // 0-indexed month
    var year = parseInt(matchDMY[3], 10);
    var hour = matchDMY[4] ? parseInt(matchDMY[4], 10) : 0;
    var minute = matchDMY[5] ? parseInt(matchDMY[5], 10) : 0;
    var second = matchDMY[6] ? parseInt(matchDMY[6], 10) : 0;
    var parsed = new Date(year, month, day, hour, minute, second);
    if (!isNaN(parsed.getTime())) return parsed;
  }
  
  // 3. Thử phân tích định dạng yyyy-mm-dd hh:mm:ss
  var matchYMD = str.match(/^(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?$/);
  if (matchYMD) {
    var year = parseInt(matchYMD[1], 10);
    var month = parseInt(matchYMD[2], 10) - 1;
    var day = parseInt(matchYMD[3], 10);
    var hour = matchYMD[4] ? parseInt(matchYMD[4], 10) : 0;
    var minute = matchYMD[5] ? parseInt(matchYMD[5], 10) : 0;
    var second = matchYMD[6] ? parseInt(matchYMD[6], 10) : 0;
    var parsed = new Date(year, month, day, hour, minute, second);
    if (!isNaN(parsed.getTime())) return parsed;
  }
  
  return null;
}

function CHAY_QUET_VIEC_THU_CONG() {
  writeLog("=== BẮT ĐẦU CHẠY THỦ CÔNG ===", "INFO");
  checkAndSendLineMessage();
  writeLog("=== KẾT THÚC CHẠY THỦ CÔNG ===", "INFO");
  
  var ui = SpreadsheetApp.getUi();
  ui.alert("✅ Đã chạy quét việc xong! Vui lòng kiểm tra sheet 'Logs' để xem chi tiết kết quả.");
}

// ==========================================
// HÀM HỖ TRỢ HƯỚNG DẪN & CHAT RIÊNG
// ==========================================
function buildHelpText() {
  return "🤖 CÚ PHÁP BOT NHẮC VIỆC\n\n" +
    "📝 /gv hoặc /link - Mở form giao việc\n" +
    "🆔 /id - Lấy ID nhóm hoặc cá nhân\n" +
    "📌 /tthomnay hoặc /tuongtac - Xem tương tác hôm nay\n" +
    "📅 /tt7ngay - Xem tương tác 7 ngày\n" +
    "📖 /hd hoặc /huongdan - Giới thiệu tính năng BOT\n" +
    "❓ /help - Xem cú pháp";
}

function replyHelp(token) {
  sendLineReply(token, buildHelpText());
}

function buildGiaoFormFlexMessage() {
  var bubble = {
    "type": "bubble",
    "size": "kilo",
    "body": {
      "type": "box",
      "layout": "vertical",
      "spacing": "md",
      "contents": [
        {
          "type": "text",
          "text": "📝 GIAO VIỆC NHANH",
          "weight": "bold",
          "color": "#1DB446",
          "size": "md"
        },
        {
          "type": "text",
          "text": "Bấm nút bên dưới để mở form nhập thông tin giao việc.",
          "size": "xs",
          "color": "#666666",
          "wrap": true
        }
      ]
    },
    "footer": {
      "type": "box",
      "layout": "vertical",
      "contents": [
        {
          "type": "button",
          "style": "primary",
          "color": "#1DB446",
          "height": "sm",
          "action": {
            "type": "uri",
            "label": "Mở Form",
            "uri": LIFF_URL
          }
        }
      ]
    }
  };
  return {
    "type": "flex",
    "altText": "Mở Form Giao Việc",
    "contents": bubble
  };
}

function replyGiaoForm(token) {
  var flexMsg = {
    type: "flex",
    altText: "Mở form giao việc",
    contents: {
      type: "bubble",
      size: "kilo",
      body: {
        type: "box",
        layout: "vertical",
        spacing: "md",
        contents: [
          {
            type: "text",
            text: "📝 GIAO VIỆC NHANH",
            weight: "bold",
            size: "md",
            color: "#1DB446",
            wrap: true
          },
          {
            type: "text",
            text: "Bấm nút bên dưới để mở form giao việc.",
            size: "sm",
            color: "#555555",
            wrap: true
          },
          {
            type: "text",
            text: "Nếu bấm nút báo lỗi hệ thống, hãy kiểm tra lại cấu hình LIFF Endpoint trong LINE Developers.",
            size: "xxs",
            color: "#999999",
            wrap: true,
            margin: "sm"
          }
        ]
      },
      footer: {
        type: "box",
        layout: "vertical",
        spacing: "sm",
        contents: [
          {
            type: "button",
            style: "primary",
            color: "#1DB446",
            height: "sm",
            action: {
              type: "uri",
              label: "Mở form giao việc",
              uri: LIFF_URL
            }
          }
        ]
      }
    },
    quickReply: {
      items: [
        {
          type: "action",
          action: {
            type: "uri",
            label: "Mở form",
            uri: LIFF_URL
          }
        },
        {
          type: "action",
          action: {
            type: "message",
            label: "Trợ giúp",
            text: "/help"
          }
        }
      ]
    }
  };

  replyMessages(token, [flexMsg], "LINE giao form flex reply");
}


// ==========================================
// HÀM LƯU ẢNH BASE64 TỪ LIFF VÀO GOOGLE DRIVE
// ==========================================
function saveLiffImageToDrive(imageFile) {
  if (!imageFile || !imageFile.dataUrl) return "";

  var folderName = "BOT - LINE";
  var folders = DriveApp.getFoldersByName(folderName);
  var folder = folders.hasNext() ? folders.next() : DriveApp.createFolder(folderName);
  folder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

  var contentType = imageFile.type || imageFile.dataUrl.substring(5, imageFile.dataUrl.indexOf(';'));
  var base64 = imageFile.dataUrl.split(',')[1];
  var bytes = Utilities.base64Decode(base64);
  var safeName = imageFile.name || ("liff-upload-" + new Date().getTime() + ".jpg");

  var blob = Utilities.newBlob(bytes, contentType, safeName);
  var file = folder.createFile(blob);
  var fileId = file.getId();

  var directLink = "https://lh3.googleusercontent.com/d/" + fileId;

  var sheet = getSpreadsheet().getSheetByName("Link_img");
  if (sheet) sheet.appendRow([safeName, directLink]);

  return directLink;
}

// ==========================================
// HÀM TẠO VÀ CẤU HÌNH RICH MENU
// ==========================================
function SETUP_RICH_MENU() {
  var url = "https://api.line.me/v2/bot/richmenu";

  var payload = {
    size: {
      width: 2500,
      height: 1686
    },
    selected: true,
    name: "BOT NHAC VIEC",
    chatBarText: "Menu",
    areas: [
      {
        bounds: { x: 0, y: 0, width: 833, height: 843 },
        action: {
          type: "uri",
          label: "Giao việc",
          uri: LIFF_URL
        }
      },
      {
        bounds: { x: 833, y: 0, width: 834, height: 843 },
        action: {
          type: "message",
          label: "Hôm nay",
          text: "/tthomnay"
        }
      },
      {
        bounds: { x: 1667, y: 0, width: 833, height: 843 },
        action: {
          type: "message",
          label: "7 ngày",
          text: "/tt7ngay"
        }
      },
      {
        bounds: { x: 0, y: 843, width: 833, height: 843 },
        action: {
          type: "message",
          label: "Lấy ID",
          text: "/id"
        }
      },
      {
        bounds: { x: 833, y: 843, width: 834, height: 843 },
        action: {
          type: "message",
          label: "Hướng dẫn",
          text: "/hd"
        }
      },
      {
        bounds: { x: 1667, y: 843, width: 833, height: 843 },
        action: {
          type: "message",
          label: "Trợ giúp",
          text: "/help"
        }
      }
    ]
  };

  var res = UrlFetchApp.fetch(url, {
    method: "post",
    headers: {
      Authorization: "Bearer " + TOKEN,
      "Content-Type": "application/json"
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });

  var code = res.getResponseCode();
  var body = res.getContentText();
  writeLog("Create rich menu: " + code + " | " + body, code >= 200 && code < 300 ? "INFO" : "ERROR");

  if (code < 200 || code >= 300) {
    throw new Error("Tạo rich menu lỗi: " + body);
  }

  var data = JSON.parse(body);
  PropertiesService.getScriptProperties().setProperty("RICH_MENU_ID", data.richMenuId);

  SpreadsheetApp.getUi().alert("✅ Đã tạo Rich Menu thành công!\nID: " + data.richMenuId);
}

function UPLOAD_RICH_MENU_IMAGE_FROM_DRIVE() {
  var ui = SpreadsheetApp.getUi();
  var props = PropertiesService.getScriptProperties();
  var richMenuId = props.getProperty("RICH_MENU_ID");

  if (!richMenuId) {
    ui.alert("❌ Chưa có RICH_MENU_ID. Vui lòng bấm Tạo Rich Menu trước.");
    return;
  }

  var input = ui.prompt(
    "Upload ảnh Rich Menu",
    "Dán Google Drive File ID hoặc link ảnh Google Drive:",
    ui.ButtonSet.OK_CANCEL
  );

  if (input.getSelectedButton() !== ui.Button.OK) return;

  var raw = input.getResponseText().trim();
  if (!raw) {
    ui.alert("❌ Bạn chưa nhập link hoặc File ID ảnh.");
    return;
  }

  var fileId = raw;

  var match = raw.match(/\/d\/([a-zA-Z0-9_-]+)/);
  if (match && match[1]) {
    fileId = match[1];
  } else {
    var matchId = raw.match(/id=([a-zA-Z0-9_-]+)/);
    if (matchId && matchId[1]) {
      fileId = matchId[1];
    }
  }

  try {
    var file = DriveApp.getFileById(fileId);
    var blob = file.getBlob();
    var contentType = blob.getContentType();

    if (contentType !== "image/png" && contentType !== "image/jpeg") {
      ui.alert("❌ Ảnh phải là PNG hoặc JPG/JPEG.\nLoại hiện tại: " + contentType);
      return;
    }

    var url = "https://api-data.line.me/v2/bot/richmenu/" + richMenuId + "/content";

    var res = UrlFetchApp.fetch(url, {
      method: "post",
      headers: {
        Authorization: "Bearer " + TOKEN,
        "Content-Type": contentType
      },
      payload: blob.getBytes(),
      muteHttpExceptions: true
    });

    var code = res.getResponseCode();
    var body = res.getContentText();
    writeLog("Upload rich menu image response: " + code + " | " + body, code >= 200 && code < 300 ? "INFO" : "ERROR");

    if (code < 200 || code >= 300) {
      ui.alert("❌ Upload ảnh Rich Menu lỗi:\nHTTP " + code + "\n" + body);
      return;
    }

    ui.alert("✅ Đã upload ảnh Rich Menu thành công.\nBấm tiếp: Đặt Rich Menu mặc định.");
  } catch (e) {
    ui.alert("❌ Không tìm thấy hoặc không đọc được ảnh trên Google Drive:\n" + e.toString());
  }
}

function SET_DEFAULT_RICH_MENU() {
  var richMenuId = PropertiesService.getScriptProperties().getProperty("RICH_MENU_ID");
  if (!richMenuId) throw new Error("Chưa có RICH_MENU_ID.");

  var res = UrlFetchApp.fetch("https://api.line.me/v2/bot/user/all/richmenu/" + richMenuId, {
    method: "post",
    headers: { Authorization: "Bearer " + TOKEN },
    muteHttpExceptions: true
  });

  writeLog("Set default rich menu: " + res.getResponseCode() + " | " + res.getContentText(), "INFO");
  SpreadsheetApp.getUi().alert("✅ Đã đặt Rich Menu mặc định cho bot.");
}

function replyHuongDanBot(token) {
  var text =
    "🤖 GIỚI THIỆU BOT NHẮC VIỆC\n\n" +
    "Bot dùng để giao việc, nhắc việc và theo dõi tương tác trong nhóm LINE.\n\n" +
    "📝 Giao việc:\n" +
    "Quản lý mở form để tạo công việc, chọn nhóm nhận, người phụ trách, thời gian nhắc và hình thức xác nhận.\n\n" +
    "🔔 Nhắc việc tự động:\n" +
    "Đến giờ, bot tự gửi thông báo công việc vào nhóm.\n\n" +
    "✅ Xác nhận hoàn tất:\n" +
    "Nhân viên bấm Hoàn tất hoặc gửi ảnh nghiệm thu, trạng thái sẽ được cập nhật vào Google Sheet.\n\n" +
    "📊 Theo dõi tương tác:\n" +
    "Bot ghi nhận tin nhắn, sticker, ảnh và báo cáo tương tác hôm nay hoặc 7 ngày.\n\n" +
    "📌 Lệnh nhanh:\n" +
    "/gv - Mở form giao việc\n" +
    "/id - Lấy ID nhóm/cá nhân\n" +
    "/tthomnay - Tương tác hôm nay\n" +
    "/tt7ngay - Tương tác 7 ngày\n" +
    "/help - Xem cú pháp";

  sendLineReply(token, text);
}


// ==========================================
// TEST NHANH LINK LIFF TRONG APPS SCRIPT
// ==========================================
function TEST_LIFF_URL() {
  SpreadsheetApp.getUi().alert(
    "LIFF URL hiện tại:\n" + LIFF_URL +
    "\n\nNếu bấm trong LINE báo 'Lỗi hệ thống', hãy kiểm tra trong LINE Developers:" +
    "\n1. LIFF ID có đúng không" +
    "\n2. Endpoint URL của LIFF có đúng Web App URL đang deploy không" +
    "\n3. Web App đã deploy New version chưa" +
    "\n4. Execute as: Me, Who has access: Anyone"
  );
}

