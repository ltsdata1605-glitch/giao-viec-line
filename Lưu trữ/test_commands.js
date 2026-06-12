const fs = require('fs');
const vm = require('vm');
const path = require('path');

console.log("🧪 BẮT ĐẦU CHẠY KIỂM THỬ BỘ LỆNH LINE BOT...\n");

// Đọc mã nguồn từ bot.gs
const botGsPath = path.join(__dirname, 'bot.gs');
if (!fs.existsSync(botGsPath)) {
  console.error("❌ Không tìm thấy file bot.gs!");
  process.exit(1);
}
const code = fs.readFileSync(botGsPath, 'utf8');

// Thiết lập môi trường Mock
const mockLogs = [];
const replies = [];
const flexMessages = [];
let mockTriggers = [];
let richMenuCreated = false;

// Dữ liệu mock Sự kiện (Bảng tính) - Cấu hình 24 cột mới (Task ID ở đầu)
const mockEventsData = [
  // Header
  [
    "Task ID", "Tên sự kiện", "Nội dung", "Ngày giờ gửi", "Link ảnh đính kèm", "Lặp lại", "Nhóm nhận", 
    "Người phụ trách", "Tần suất (phút)", "Hình thức xác nhận", "Độ ưu tiên", "Người xác nhận", 
    "Trạng thái", "Lần nhắc cuối", "Số lần nhắc", "Link Ảnh Nghiệm Thu", "Deadline", 
    "Loại công việc", "Người giao việc", "Người theo dõi", "Ghi chú", "Trạng thái xử lý chi tiết", 
    "Lịch sử cập nhật", "Đã nhắc trước deadline"
  ],
  // Việc 1: Chưa hoàn thành, nhóm G123, người giao U111, người nhận U222
  [
    "TASK-20260611-120000-0001", "Công việc test 1", "Nội dung 1", "2026-06-11 12:00", "", "Không", "G123", 
    "U222", "0", "Nút bấm", "Bình thường", "", 
    "Đang làm", "", "0", "", new Date("2026-06-12T12:00:00"), 
    "Kiểm tra", "U111", "", "", "Đang làm", 
    "", ""
  ],
  // Việc 2: Quá hạn, nhóm G123, người giao U111, người nhận U222
  [
    "TASK-20260610-120000-0002", "Công việc test quá hạn", "Nội dung 2", "2026-06-10 12:00", "", "Không", "G123", 
    "U222", "0", "Nút bấm", "GẤP", "", 
    "Quá hạn", "", "1", "", new Date("2026-06-10T12:00:00"), 
    "Kiểm tra", "U111", "", "", "Quá hạn", 
    "", ""
  ],
  // Việc 3: Đã hoàn tất (Đã gửi), nhóm G123, người nhận U222
  [
    "TASK-20260611-100000-0003", "Công việc đã xong", "Nội dung 3", "2026-06-11 10:00", "", "Không", "G123", 
    "U222", "0", "Nút bấm", "Bình thường", "U222", 
    "Đã gửi", "", "0", "", new Date("2026-06-11T12:00:00"), 
    "Kiểm tra", "U111", "", "", "Đã hoàn thành", 
    "", ""
  ],
  // Việc 4: Việc ở nhóm khác (G456), người nhận U222
  [
    "TASK-20260611-100000-0004", "Công việc nhóm khác", "Nội dung 4", "2026-06-11 10:00", "", "Không", "G456", 
    "U222", "0", "Nút bấm", "Bình thường", "", 
    "Đang làm", "", "0", "", new Date("2026-06-12T12:00:00"), 
    "Kiểm tra", "U111", "", "", "Đang làm", 
    "", ""
  ]
];

// Dữ liệu mock Logs (để xem log)
const mockLogsSheetData = [
  ["Thời gian", "Loại", "Nội dung log"],
  ["2026-06-11 20:00:00", "INFO", "Khởi động bot"],
  ["2026-06-11 20:01:00", "ERROR", "LINE API Error Code 400: Invalid reply token"],
  ["2026-06-11 20:02:00", "ERROR", "Sheet not found: ID_Member"],
  ["2026-06-11 20:03:00", "INFO", "Quét việc hoàn tất"],
  ["2026-06-11 20:04:00", "ERROR", "Lỗi gửi thông báo đến group G123"],
  ["2026-06-11 20:05:00", "ERROR", "Failed to update status for row 5"],
  ["2026-06-11 20:06:00", "ERROR", "Rich menu image upload failed: 404"]
];

const mockChatbotData = [
  ["Từ khóa", "Văn bản trả lời", "Link ảnh Google Drive"],
  ["testkeyword", "Đây là câu trả lời chatbot test", ""]
];

// Mới: Khởi tạo Daily_Report theo cấu trúc mới
const mockDailyReportData = [
  ["Ngày", "Group ID", "Tổng việc", "Đã xong", "Chưa xong", "Quá hạn", "Cần hỗ trợ", "Nội dung báo cáo"]
];

const mockSettingsData = [
  ["Key", "Value", "Mô tả"],
  ["Giờ báo cáo cuối ngày", "21:00", "Thời gian tự động gửi báo cáo cuối ngày (định dạng HH:mm)"]
];

const mockIdGroupData = [
  ["Tên Group", "ID Group"],
  ["Nhóm Test LINE", "G123"]
];

const mockIdMemberData = [
  ["Tên Line", "ID Line"],
  ["Admin Khoa", "Ua5509d3b3780ee833633e8b4ad332b70"],
  ["Người Giao Việc", "U111"],
  ["Nhân Viên Nhận Việc", "U222"],
  ["Quản lý Minh", "U_QuanLy"],
  ["Tổ trưởng Hùng", "U_ToTruong"],
  ["Tổ trưởng Tuấn", "U_ToTruongKhac"],
  ["Nhân viên Bị khóa", "U_BiKhoa"],
  ["Khách Lãng Du", "U_Khach"]
];

const mockUserRolesData = [
  ["Tên Line", "User ID", "Vai trò", "Nhóm phụ trách", "Trạng thái", "Ghi chú", "Ngày cập nhật"],
  ["Admin Khoa", "Ua5509d3b3780ee833633e8b4ad332b70", "Admin", "", "Hoạt động", "", ""],
  ["Quản lý Minh", "U_QuanLy", "Quản lý", "", "Hoạt động", "", ""],
  ["Tổ trưởng Hùng", "U_ToTruong", "Tổ trưởng", "G123", "Hoạt động", "", ""],
  ["Tổ trưởng Tuấn", "U_ToTruongKhac", "Tổ trưởng", "G456", "Hoạt động", "", ""],
  ["Nhân Viên Nhận Việc", "U222", "Nhân viên", "", "Hoạt động", "", ""],
  ["Nhân viên Bị khóa", "U_BiKhoa", "Nhân viên", "", "Tạm khóa", "", ""],
  ["Khách Lãng Du", "U_Khach", "Khách", "", "Hoạt động", "", ""]
];

// Registry tất cả các mock sheets
const allSheetsData = {
  "Sự kiện": mockEventsData,
  "Logs": mockLogsSheetData,
  "Chatbot": mockChatbotData,
  "Daily_Report": mockDailyReportData,
  "Settings": mockSettingsData,
  "ID_Group": mockIdGroupData,
  "ID_Member": mockIdMemberData,
  "User_Roles": mockUserRolesData,
  "Tương Tác": [
    ["Thời gian", "User ID", "Tên Line", "Nhóm", "Hành động", "Nội dung"],
    ["2026-06-11 20:00:00", "U222", "Nhân Viên Nhận Việc", "G123", "Nhắn tin", "tt"]
  ],
  "Link_img": [
    ["Tên Ảnh", "Link Ảnh"]
  ],
  "Task_Logs": [["Thời gian", "Task ID", "Hành động", "Người thực hiện", "Nội dung cũ", "Nội dung mới", "Ghi chú"]],
  "Task_Comments": [["Thời gian", "Task ID", "User ID", "Tên Line", "Bình luận", "Link ảnh"]],
  "Task_Templates": [["Tên mẫu", "Loại công việc", "Tiêu đề mẫu", "Nội dung mẫu", "Ưu tiên mặc định", "Hình thức xác nhận mặc định"]]
};

const mockScriptProperties = {
  'SPREADSHEET_ID': 'MOCK_SS_123',
  'RICH_MENU_ID': 'richmenu-mock-id-999',
  'LIFF_ID': '2010371497-R9x4l665',
  'LINE_CHANNEL_ACCESS_TOKEN': 'mock-channel-access-token-xyz'
};

// Mock GAS Classes & Methods
const mockSandbox = {
  console: console,
  ContentService: {
    MimeType: { JSON: "JSON" },
    createTextOutput: function(text) {
      return {
        setMimeType: function(mime) {
          return this;
        },
        getContent: function() {
          return text;
        }
      };
    }
  },
  Logger: {
    log: function(msg) {
      console.log("[GAS Logger]", msg);
    }
  },
  Utilities: {
    sleep: function(ms) {
      // Mock sleep - no need to delay tests
    },
    base64Decode: function(str) {
      return Buffer.from(str, 'base64');
    },
    newBlob: function(bytes, contentType, name) {
      return { bytes, contentType, name };
    },
    formatDate: function(date, tz, format) {
      const pad = (n) => String(n).padStart(2, '0');
      const d = new Date(date);
      if (format === "yyyy-MM-dd HH:mm:ss") {
        return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
      }
      if (format === "yyyy-MM-dd") {
        return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
      }
      if (format === "dd-MM-yyyy HH:mm") {
        return `${pad(d.getDate())}-${pad(d.getMonth()+1)}-${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
      }
      return d.toISOString();
    }
  },
  Session: {
    getScriptTimeZone: function() {
      return "Asia/Ho_Chi_Minh";
    }
  },
  PropertiesService: {
    getScriptProperties: function() {
      return {
        getProperty: function(key) {
          return mockScriptProperties[key] || null;
        },
        setProperty: function(key, val) {
          mockScriptProperties[key] = val;
        }
      };
    }
  },
  UrlFetchApp: {
    fetch: function(url, options) {
      if (url.includes("/content")) {
        return {
          getResponseCode: () => 200,
          getContentText: () => "",
          getBlob: () => {
            return {
              setName: function(name) { return this; },
              getContentType: function() { return "image/jpeg"; },
              getBytes: function() { return [1, 2, 3]; }
            };
          }
        };
      }
      if (url === "https://api.line.me/v2/bot/message/reply" || url === "https://api.line.me/v2/bot/message/push") {
        const payloadObj = JSON.parse(options.payload);
        const token = payloadObj.replyToken || payloadObj.to;
        const msgs = payloadObj.messages;
        
        // Kiểm tra xem có chứa Flex message không
        const hasFlex = msgs.some(m => m.type === "flex");
        if (hasFlex) {
          flexMessages.push({
            replyToken: token,
            messages: msgs,
            altText: msgs.find(m => m.type === "flex").altText
          });
        } else {
          const text = msgs.map(m => m.text || `[${m.type}]`).join(" ");
          replies.push({ replyToken: token, text });
        }
        return {
          getResponseCode: () => 200,
          getContentText: () => "{}"
        };
      }
      
      if (url === "https://api.line.me/v2/bot/user/all/richmenu") {
        return {
          getResponseCode: () => 200,
          getContentText: () => JSON.stringify({ richMenuId: "richmenu-mock-id-999" })
        };
      }
      
      if (url.includes("/member/") || url.includes("/profile/")) {
        const uId = url.substring(url.lastIndexOf("/") + 1);
        let displayName = "Nhân viên";
        if (uId === "Ua5509d3b3780ee833633e8b4ad332b70") displayName = "Admin Khoa";
        else if (uId === "U111") displayName = "Người Giao Việc";
        else if (uId === "U222") displayName = "Nhân Viên Nhận Việc";
        else if (uId === "U_QuanLy") displayName = "Quản lý Minh";
        else if (uId === "U_ToTruong") displayName = "Tổ trưởng Hùng";
        else if (uId === "U_ToTruongKhac") displayName = "Tổ trưởng Tuấn";
        else if (uId === "U_BiKhoa") displayName = "Nhân viên Bị khóa";
        else if (uId === "U_Khach") displayName = "Khách Lãng Du";
        
        return {
          getResponseCode: () => 200,
          getContentText: () => JSON.stringify({ displayName }),
          toString: () => JSON.stringify({ displayName })
        };
      }
      
      if (url === "https://api.line.me/v2/bot/richmenu") {
        richMenuCreated = true;
        return {
          getResponseCode: () => 200,
          getContentText: () => JSON.stringify({ richMenuId: "richmenu-newly-created-111" })
        };
      }
      
      return {
        getResponseCode: () => 200,
        getContentText: () => "{}"
      };
    }
  },
  ScriptApp: {
    getProjectTriggers: function() {
      return mockTriggers;
    },
    deleteTrigger: function(trigger) {
      const idx = mockTriggers.indexOf(trigger);
      if (idx !== -1) mockTriggers.splice(idx, 1);
    },
    newTrigger: function(funcName) {
      return {
        timeBased: function() {
          return {
            everyMinutes: function(n) {
              return {
                create: function() {
                  const t = { getHandlerFunction: () => funcName };
                  mockTriggers.push(t);
                  return t;
                }
              };
            },
            everyDays: function(n) {
              return {
                atHour: function(h) {
                  return {
                    nearMinute: function(m) {
                      return {
                        create: function() {
                          const t = { getHandlerFunction: () => funcName };
                          mockTriggers.push(t);
                          return t;
                        }
                      };
                    }
                  };
                }
              };
            },
            onWeekDay: function(wd) {
              return {
                atHour: function(h) {
                  return {
                    create: function() {
                      const t = { getHandlerFunction: () => funcName };
                      mockTriggers.push(t);
                      return t;
                    }
                  };
                }
              };
            }
          };
        }
      };
    },
    WeekDay: {
      SUNDAY: "SUNDAY"
    }
  },
  SpreadsheetApp: {
    getActiveSpreadsheet: function() {
      return mockSandbox.SpreadsheetApp.mockSpreadsheet;
    },
    openById: function(id) {
      return mockSandbox.SpreadsheetApp.mockSpreadsheet;
    },
    getUi: function() {
      return {
        ButtonSet: { YES_NO: "YES_NO", OK_CANCEL: "OK_CANCEL" },
        Button: { YES: "YES", NO: "NO", OK: "OK", CANCEL: "CANCEL" },
        alert: function(title, prompt, buttonSet) {
          mockSandbox.writeLog(`UI Alert: ${title} - ${prompt}`, "INFO");
          return "YES";
        },
        prompt: function(title, prompt, buttonSet) {
          mockSandbox.writeLog(`UI Prompt: ${title} - ${prompt}`, "INFO");
          return {
            getSelectedButton: function() { return "OK"; },
            getResponseText: function() { return "mock_file_id"; }
          };
        }
      };
    }
  },
  DriveApp: {
    Access: { ANYONE_WITH_LINK: "ANYONE_WITH_LINK" },
    Permission: { VIEW: "VIEW" },
    getFoldersByName: function(name) {
      return {
        hasNext: function() { return true; },
        next: function() {
          return {
            setSharing: function() {},
            getFoldersByName: function(subName) {
              return {
                hasNext: function() { return true; },
                next: function() {
                  return {
                    setSharing: function() {},
                    createFile: function(blob) {
                      return {
                        getId: function() { return "mock_file_id"; },
                        getUrl: function() { return "https://drive.google.com/file/d/mock_file_id/view"; }
                      };
                    }
                  };
                }
              };
            },
            createFolder: function(subName) {
              return {
                setSharing: function() {},
                createFile: function(blob) {
                  return {
                    getId: function() { return "mock_file_id"; },
                    getUrl: function() { return "https://drive.google.com/file/d/mock_file_id/view"; }
                  };
                }
              };
            },
            createFile: function(blob) {
              return {
                getId: function() { return "mock_file_id"; },
                getUrl: function() { return "https://drive.google.com/file/d/mock_file_id/view"; }
              };
            }
          };
        }
      };
    },
    createFolder: function(name) {
      return {
        setSharing: function() {},
        getFoldersByName: function(subName) {
          return {
            hasNext: function() { return true; },
            next: function() {
              return {
                setSharing: function() {},
                createFile: function(blob) {
                  return {
                    getId: function() { return "mock_file_id"; },
                    getUrl: function() { return "https://drive.google.com/file/d/mock_file_id/view"; }
                  };
                }
              };
            }
          };
        },
        createFolder: function(subName) {
          return {
            setSharing: function() {},
            createFile: function(blob) {
              return {
                getId: function() { return "mock_file_id"; },
                getUrl: function() { return "https://drive.google.com/file/d/mock_file_id/view"; }
              };
            }
          };
        },
        createFile: function(blob) {
          return {
            getId: function() { return "mock_file_id"; },
            getUrl: function() { return "https://drive.google.com/file/d/mock_file_id/view"; }
          };
        }
      };
    },
    getFileById: function(id) {
      return {
        getSize: function() { return 500000; }, // 0.5 MB by default
        getBlob: function() {
          return {
            getContentType: function() { return "image/png"; },
            getBytes: function() { return [1, 2, 3]; }
          };
        }
      };
    }
  }
};

// Tạo mock sheet
const createMockSheet = (name) => {
  if (!allSheetsData[name]) {
    allSheetsData[name] = [["Header"]];
  }
  const rawData = allSheetsData[name];
  return {
    getName: () => name,
    getLastRow: () => rawData.length,
    getLastColumn: () => rawData[0] ? rawData[0].length : 0,
    getDataRange: () => ({
      getValues: () => rawData
    }),
    getRange: (row, col, numRows, numCols) => {
      const rStart = row - 1;
      const cStart = col - 1;
      const actualRows = numRows !== undefined ? numRows : 1;
      const actualCols = numCols !== undefined ? numCols : 1;
      
      const rangeObj = {
        getValues: () => {
          const res = [];
          for (let r = rStart; r < rStart + actualRows; r++) {
            const rowData = [];
            for (let c = cStart; c < cStart + actualCols; c++) {
              let val = "";
              if (rawData[r] && rawData[r][c] !== undefined) {
                val = rawData[r][c];
              }
              rowData.push(val);
            }
            res.push(rowData);
          }
          return res;
        },
        getValue: () => {
          return (rawData[rStart] && rawData[rStart][cStart] !== undefined) ? rawData[rStart][cStart] : "";
        },
        setValue: (val) => {
          if (!rawData[rStart]) rawData[rStart] = [];
          rawData[rStart][cStart] = val;
        },
        setValues: (valuesArray) => {
          for (let r = 0; r < valuesArray.length; r++) {
            const destRow = rStart + r;
            if (!rawData[destRow]) {
              rawData[destRow] = [];
            }
            for (let c = 0; c < valuesArray[r].length; c++) {
              const destCol = cStart + c;
              rawData[destRow][destCol] = valuesArray[r][c];
            }
          }
        },
        clearContent: () => {
          for (let r = rStart; r < rStart + actualRows; r++) {
            if (rawData[r]) {
              for (let c = cStart; c < cStart + actualCols; c++) {
                rawData[r][c] = "";
              }
            }
          }
        },
        setFontWeight: function(weight) {
          return this;
        },
        setBackground: function(color) {
          return this;
        }
      };
      return rangeObj;
    },
    appendRow: (rowArray) => {
      rawData.push(rowArray);
    },
    insertColumnBefore: (colIndex) => {
      const cIdx = colIndex - 1;
      for (let r = 0; r < rawData.length; r++) {
        if (rawData[r]) {
          rawData[r].splice(cIdx, 0, "");
        }
      }
    },
    deleteRows: (startRow, numRows) => {
      rawData.splice(startRow - 1, numRows);
    },
    setFrozenRows: function(rows) {
      // Mock setFrozenRows
    }
  };
};

mockSandbox.SpreadsheetApp.mockSpreadsheet = {
  getId: () => "MOCK_SS_123",
  getSheetByName: function(name) {
    if (allSheetsData[name]) {
      return createMockSheet(name);
    }
    return null;
  },
  insertSheet: function(name) {
    if (!allSheetsData[name]) {
      allSheetsData[name] = [];
    }
    return createMockSheet(name);
  }
};

mockSandbox.writeLog = function(message, type) {
  mockLogs.push({ message, type });
  console.log(`[LOG - ${type || "INFO"}] ${message}`);
};

mockSandbox.getUserName = function(uId, gId) {
  if (uId === "Ua5509d3b3780ee833633e8b4ad332b70") return "Admin Khoa";
  if (uId === "U111") return "Người Giao Việc";
  if (uId === "U222") return "Nhân Viên Nhận Việc";
  if (uId === "U_QuanLy") return "Quản lý Minh";
  if (uId === "U_ToTruong") return "Tổ trưởng Hùng";
  if (uId === "U_ToTruongKhac") return "Tổ trưởng Tuấn";
  if (uId === "U_BiKhoa") return "Nhân viên Bị khóa";
  if (uId === "U_Khach") return "Khách Lãng Du";
  return "Người dùng khác";
};

mockSandbox.getGroupName = function(gId) {
  return "Nhóm Test LINE";
};

// Evaluate bot.gs inside mock context
const context = vm.createContext(mockSandbox);
vm.runInContext(code, context);

// Bắt đầu chạy test cases
const assert = require('assert');

function runTest(testName, testFn) {
  try {
    mockLogs.length = 0;
    replies.length = 0;
    flexMessages.length = 0;
    richMenuCreated = false;
    
    testFn();
    console.log(`   ✅ PASSED: ${testName}`);
  } catch (err) {
    console.error(`   ❌ FAILED: ${testName}`);
    console.error(err);
    process.exit(1);
  }
}

// ----------------------------------------------------
// PHẦN A: TEST CÁC LỆNH TRONG CHAT RIÊNG (Private Chat)
// ----------------------------------------------------
console.log("--- PHẦN A: CHAT RIÊNG ---");

runTest("Lệnh /help trong chat riêng", () => {
  const event = { replyToken: "token_1" };
  const handled = mockSandbox.handleTextCommand(event, "/help", "U222", null);
  assert.strictEqual(handled, true);
  assert.strictEqual(flexMessages.length, 1);
  assert.strictEqual(flexMessages[0].altText, "Trợ giúp bot nhắc việc");
});

runTest("Lệnh /hd (Hướng dẫn) trong chat riêng", () => {
  const event = { replyToken: "token_2" };
  const handled = mockSandbox.handleTextCommand(event, "/hd", "U222", null);
  assert.strictEqual(handled, true);
  assert.strictEqual(flexMessages.length, 1);
  assert.strictEqual(flexMessages[0].altText, "Hướng dẫn sử dụng bot");
});

runTest("Lệnh /gv (Giao việc) trong chat riêng", () => {
  const event = { replyToken: "token_3" };
  const handled = mockSandbox.handleTextCommand(event, "/gv", "U222", null);
  assert.strictEqual(handled, true);
  assert.strictEqual(flexMessages.length, 1);
  assert.strictEqual(flexMessages[0].altText, "Mở Form Giao Việc");
});

runTest("Lệnh /id trong chat riêng", () => {
  const event = { replyToken: "token_4" };
  const handled = mockSandbox.handleTextCommand(event, "/id", "U222", null);
  assert.strictEqual(handled, true);
  assert.strictEqual(replies.length, 1);
  assert.ok(replies[0].text.includes("U222"));
  assert.ok(!replies[0].text.includes("Group ID"));
});

runTest("Lệnh /tthomnay trong chat riêng (yêu cầu báo lỗi hướng dẫn)", () => {
  const event = { replyToken: "token_5" };
  const handled = mockSandbox.handleTextCommand(event, "/tthomnay", "U222", null);
  assert.strictEqual(handled, true);
  assert.strictEqual(replies.length, 1);
  assert.ok(replies[0].text.includes("chỉ dùng được trong nhóm LINE"));
});

runTest("Lệnh /tt7ngay trong chat riêng (yêu cầu báo lỗi hướng dẫn)", () => {
  const event = { replyToken: "token_6" };
  const handled = mockSandbox.handleTextCommand(event, "/tt7ngay", "U222", null);
  assert.strictEqual(handled, true);
  assert.strictEqual(replies.length, 1);
  assert.ok(replies[0].text.includes("chỉ dùng được trong nhóm LINE"));
});

runTest("Lệnh /vieccuatoi trong chat riêng (lọc việc của U222 ở MỌI nhóm)", () => {
  const event = { replyToken: "token_7" };
  const handled = mockSandbox.handleTextCommand(event, "/vieccuatoi", "U222", null);
  assert.strictEqual(handled, true);
  assert.strictEqual(flexMessages.length, 1);
  
  const contents = flexMessages[0].messages[0].contents.body.contents;
  assert.strictEqual(contents.length, 5); // 3 tasks + 2 separators
  assert.ok(contents[0].contents[0].text.includes("Công việc test 1"));
  assert.ok(contents[2].contents[0].text.includes("Công việc test quá hạn"));
  assert.ok(contents[4].contents[0].text.includes("Công việc nhóm khác"));
});

runTest("Lệnh /chuaxong trong chat riêng (yêu cầu báo lỗi hướng dẫn)", () => {
  const event = { replyToken: "token_8" };
  const handled = mockSandbox.handleTextCommand(event, "/chuaxong", "U222", null);
  assert.strictEqual(handled, true);
  assert.strictEqual(replies.length, 1);
  assert.ok(replies[0].text.includes("chỉ dùng được trong nhóm LINE"));
});

runTest("Lệnh /trehan trong chat riêng (yêu cầu báo lỗi hướng dẫn)", () => {
  const event = { replyToken: "token_9" };
  const handled = mockSandbox.handleTextCommand(event, "/trehan", "U222", null);
  assert.strictEqual(handled, true);
  assert.strictEqual(replies.length, 1);
  assert.ok(replies[0].text.includes("chỉ dùng được trong nhóm LINE"));
});

runTest("Lệnh /dagiao trong chat riêng (lọc việc do U111 giao ở MỌI nhóm)", () => {
  const event = { replyToken: "token_10" };
  const handled = mockSandbox.handleTextCommand(event, "/dagiao", "U111", null);
  assert.strictEqual(handled, true);
  assert.strictEqual(flexMessages.length, 1);
  
  const contents = flexMessages[0].messages[0].contents.body.contents;
  assert.strictEqual(contents.length, 5); // 3 tasks + 2 separators
});

runTest("Lệnh /bot trong chat riêng", () => {
  const event = { replyToken: "token_11" };
  const handled = mockSandbox.handleTextCommand(event, "/bot", "U222", null);
  assert.strictEqual(handled, true);
  assert.strictEqual(flexMessages.length, 1);
  assert.strictEqual(flexMessages[0].altText, "Trạng thái hệ thống Bot");
});

runTest("Lệnh /mau trong chat riêng", () => {
  const event = { replyToken: "token_12" };
  const handled = mockSandbox.handleTextCommand(event, "/mau", "U222", null);
  assert.strictEqual(handled, true);
  assert.strictEqual(flexMessages.length, 1);
  assert.strictEqual(flexMessages[0].altText, "Mẫu công việc nhanh");
});


// ----------------------------------------------------
// PHẦN B: TEST CÁC LỆNH TRONG NHÓM CHAT (Group Chat)
// ----------------------------------------------------
console.log("\n--- PHẦN B: CHAT NHÓM ---");

runTest("Lệnh /help trong nhóm", () => {
  const event = { replyToken: "token_g1" };
  const handled = mockSandbox.handleTextCommand(event, "/help", "U222", "G123");
  assert.strictEqual(handled, true);
  assert.strictEqual(flexMessages.length, 1);
  assert.strictEqual(flexMessages[0].altText, "Trợ giúp bot nhắc việc");
});

runTest("Lệnh /id trong nhóm", () => {
  const event = { replyToken: "token_g2" };
  const handled = mockSandbox.handleTextCommand(event, "/id", "U222", "G123");
  assert.strictEqual(handled, true);
  assert.strictEqual(replies.length, 1);
  assert.ok(replies[0].text.includes("U222"));
  assert.ok(replies[0].text.includes("G123"));
});

runTest("Lệnh /tthomnay trong nhóm", () => {
  const event = { replyToken: "token_g3" };
  const handled = mockSandbox.handleTextCommand(event, "/tthomnay", "U222", "G123");
  assert.strictEqual(handled, true);
  assert.ok(replies.length > 0 || flexMessages.length > 0);
});

runTest("Lệnh /tt7ngay trong nhóm", () => {
  const event = { replyToken: "token_g4" };
  const handled = mockSandbox.handleTextCommand(event, "/tt7ngay", "U222", "G123");
  assert.strictEqual(handled, true);
  assert.ok(replies.length > 0 || flexMessages.length > 0);
});

runTest("Lệnh /vieccuatoi trong nhóm (lọc việc của U222 CHỈ trong nhóm G123)", () => {
  const event = { replyToken: "token_g5" };
  const handled = mockSandbox.handleTextCommand(event, "/vieccuatoi", "U222", "G123");
  assert.strictEqual(handled, true);
  assert.strictEqual(flexMessages.length, 1);
  
  const contents = flexMessages[0].messages[0].contents.body.contents;
  assert.strictEqual(contents.length, 3); // 2 tasks + 1 separator
  assert.ok(contents[0].contents[0].text.includes("Công việc test 1"));
  assert.ok(contents[2].contents[0].text.includes("Công việc test quá hạn"));
});

runTest("Lệnh /chuaxong trong nhóm", () => {
  const event = { replyToken: "token_g6" };
  const handled = mockSandbox.handleTextCommand(event, "/chuaxong", "U_ToTruong", "G123");
  assert.strictEqual(handled, true);
  assert.strictEqual(flexMessages.length, 1);
  
  const contents = flexMessages[0].messages[0].contents.body.contents;
  assert.strictEqual(contents.length, 3); // 2 tasks + 1 separator
});

runTest("Lệnh /trehan trong nhóm", () => {
  const event = { replyToken: "token_g7" };
  const handled = mockSandbox.handleTextCommand(event, "/trehan", "U_ToTruong", "G123");
  assert.strictEqual(handled, true);
  assert.strictEqual(flexMessages.length, 1);
  
  const contents = flexMessages[0].messages[0].contents.body.contents;
  assert.strictEqual(contents.length, 1); // 1 task
  assert.ok(contents[0].contents[0].text.includes("Công việc test quá hạn"));
});

runTest("Lệnh /dagiao trong nhóm", () => {
  const event = { replyToken: "token_g8" };
  const handled = mockSandbox.handleTextCommand(event, "/dagiao", "U111", "G123");
  assert.strictEqual(handled, true);
  assert.strictEqual(flexMessages.length, 1);
  
  const contents = flexMessages[0].messages[0].contents.body.contents;
  assert.strictEqual(contents.length, 3); // 2 tasks + 1 separator
});


// ----------------------------------------------------
// PHẦN C: TEST QUYỀN ADMIN (Admin vs Non-Admin)
// ----------------------------------------------------
console.log("\n--- PHẦN C: QUYỀN ADMIN ---");

runTest("Lệnh /log bởi User KHÔNG PHẢI Admin", () => {
  const event = { replyToken: "token_admin1" };
  const handled = mockSandbox.handleTextCommand(event, "/log", "U222", null);
  assert.strictEqual(handled, true);
  assert.strictEqual(replies.length, 1);
  assert.ok(replies[0].text.includes("không có quyền Admin"));
});

runTest("Lệnh /log bởi User LÀ Admin", () => {
  const event = { replyToken: "token_admin2" };
  const handled = mockSandbox.handleTextCommand(event, "/log", "Ua5509d3b3780ee833633e8b4ad332b70", null);
  assert.strictEqual(handled, true);
  assert.strictEqual(replies.length, 1);
  assert.ok(replies[0].text.includes("5 DÒNG LOG LỖI GẦN NHẤT:"));
  assert.ok(replies[0].text.includes("LINE API Error Code 400"));
  assert.ok(replies[0].text.includes("Rich menu image upload failed"));
  assert.ok(!replies[0].text.includes("Khởi động bot")); // Log INFO
});

runTest("Lệnh /resetmenu bởi User KHÔNG PHẢI Admin", () => {
  const event = { replyToken: "token_admin3" };
  const handled = mockSandbox.handleTextCommand(event, "/resetmenu", "U222", null);
  assert.strictEqual(handled, true);
  assert.strictEqual(replies.length, 1);
  assert.ok(replies[0].text.includes("không có quyền Admin"));
  assert.strictEqual(richMenuCreated, false);
});

runTest("Lệnh /resetmenu bởi User LÀ Admin", () => {
  const event = { replyToken: "token_admin4" };
  const handled = mockSandbox.handleTextCommand(event, "/resetmenu", "Ua5509d3b3780ee833633e8b4ad332b70", null);
  assert.strictEqual(handled, true);
  assert.strictEqual(replies.length, 1);
  assert.ok(replies[0].text.includes("tạo lại Rich Menu thành công"));
  assert.strictEqual(richMenuCreated, true);
});


// ----------------------------------------------------
// PHẦN D: TEST CÁC LỆNH BÁO CÁO MỚI (Reports)
// ----------------------------------------------------
console.log("\n--- PHẦN D: BÁO CÁO CÔNG VIỆC MỚI ---");

runTest("Lệnh /viechomnay trong chat riêng", () => {
  const event = { replyToken: "token_rep1" };
  // Vì ngày hôm nay trong test được thiết lập động:
  // Ta đổi ngày gửi của Việc 3 và Việc 4 thành hôm nay để test
  mockEventsData[3][3] = new Date(); // Việc 3
  
  // Dùng tài khoản Quản lý Minh để được xem báo cáo trong chat riêng
  const handled = mockSandbox.handleTextCommand(event, "/viechomnay", "U_QuanLy", null);
  assert.strictEqual(handled, true);
  assert.strictEqual(flexMessages.length, 1);
  assert.strictEqual(flexMessages[0].altText, "Báo cáo công việc hôm nay");
});

runTest("Lệnh /viechomnay trong nhóm G123", () => {
  const event = { replyToken: "token_rep2" };
  // Dùng tài khoản Tổ trưởng Hùng quản lý nhóm G123
  const handled = mockSandbox.handleTextCommand(event, "/viechomnay", "U_ToTruong", "G123");
  assert.strictEqual(handled, true);
  assert.strictEqual(flexMessages.length, 1);
  assert.strictEqual(flexMessages[0].altText, "Báo cáo công việc hôm nay");
});

runTest("Lệnh /viec7ngay trong chat riêng", () => {
  const event = { replyToken: "token_rep3" };
  // Dùng tài khoản Admin
  const handled = mockSandbox.handleTextCommand(event, "/viec7ngay", "Ua5509d3b3780ee833633e8b4ad332b70", null);
  assert.strictEqual(handled, true);
  assert.strictEqual(flexMessages.length, 1);
  assert.strictEqual(flexMessages[0].altText, "Báo cáo công việc 7 ngày");
});

runTest("Lệnh /nv không có query (mặc định lấy hiệu suất chính mình)", () => {
  const event = { replyToken: "token_rep4" };
  const handled = mockSandbox.handleTextCommand(event, "/nv", "U222", null);
  assert.strictEqual(handled, true);
  assert.strictEqual(flexMessages.length, 1);
  assert.ok(flexMessages[0].altText.includes("Hiệu suất nhân viên"));
});

runTest("Lệnh /nv tìm theo tên nhân viên (bởi Quản lý)", () => {
  const event = { replyToken: "token_rep5" };
  const handled = mockSandbox.handleTextCommand(event, "/nv Admin Khoa", "U_QuanLy", null);
  assert.strictEqual(handled, true);
  assert.strictEqual(flexMessages.length, 1);
  assert.ok(flexMessages[0].altText.includes("Hiệu suất nhân viên Admin Khoa"));
});

runTest("Lệnh /baocaotuan trong nhóm", () => {
  const event = { replyToken: "token_rep6" };
  // Dùng tài khoản Quản lý
  const handled = mockSandbox.handleTextCommand(event, "/baocaotuan", "U_QuanLy", "G123");
  assert.strictEqual(handled, true);
  assert.strictEqual(flexMessages.length, 1);
  assert.strictEqual(flexMessages[0].altText, "Báo cáo tuần công việc");
});


// ----------------------------------------------------
// PHẦN E: TEST TRIGGER BÁO CÁO VÀ TIỆN ÍCH HỆ THỐNG
// ----------------------------------------------------
console.log("\n--- PHẦN E: TIỆN ÍCH TRIGGER & BÁO CÁO TỰ ĐỘNG ---");

runTest("Hàm SETUP_TRIGGERS dọn dẹp và tạo mới triggers", () => {
  mockTriggers = [
    { getHandlerFunction: () => "checkAndSendLineMessage" }
  ];
  mockSandbox.SETUP_TRIGGERS();
  // Có 3 trigger được tạo ra: checkAndSendLineMessage, guiBaoCaoCuoiNgayTuDong, guiBaoCaoTuanTuDong
  assert.strictEqual(mockTriggers.length, 3);
  assert.strictEqual(mockTriggers[0].getHandlerFunction(), "checkAndSendLineMessage");
  assert.strictEqual(mockTriggers[1].getHandlerFunction(), "guiBaoCaoCuoiNgayTuDong");
  assert.strictEqual(mockTriggers[2].getHandlerFunction(), "guiBaoCaoTuanTuDong");
});

runTest("Hàm guiBaoCaoCuoiNgayTuDong chạy tự động, ghi log & lưu Daily_Report", () => {
  mockDailyReportData.length = 1; // Reset sheet Daily_Report về ban đầu (chỉ còn header)
  
  mockSandbox.guiBaoCaoCuoiNgayTuDong();
  
  // Sheet Daily_Report phải lưu 1 dòng cho nhóm G123
  assert.strictEqual(mockDailyReportData.length, 2);
  const reportRow = mockDailyReportData[1];
  assert.strictEqual(reportRow[1], "G123"); // Group ID
  assert.strictEqual(reportRow[2], 3); // Tổng việc
  assert.strictEqual(reportRow[3], 1); // Đã xong
  assert.strictEqual(reportRow[4], 2); // Chưa xong
  assert.strictEqual(reportRow[5], 1); // Quá hạn
  assert.strictEqual(reportRow[6], 0); // Cần hỗ trợ
  assert.ok(reportRow[7].includes("33%")); // Nội dung báo cáo (Tỷ lệ hoàn thành)
});

console.log("\n--- PHẦN F: TEST BẢO MẬT & PHÂN QUYỀN VAI TRÒ (RBAC) ---");

runTest("Tổ trưởng giao việc thành công trong nhóm quản lý và thất bại ở nhóm khác", () => {
  // Tổ trưởng Hùng quản lý G123, không quản lý G456
  const eventG123 = { replyToken: "token_g123" };
  const handledG123 = mockSandbox.handleTextCommand(eventG123, "/gv", "U_ToTruong", "G123");
  assert.strictEqual(handledG123, true);
  assert.strictEqual(flexMessages.length, 1);
  assert.strictEqual(flexMessages[0].altText, "Mở Form Giao Việc");
  
  // Giao việc ở G456 bị chặn
  const eventG456 = { replyToken: "token_g456" };
  const handledG456 = mockSandbox.handleTextCommand(eventG456, "/gv", "U_ToTruong", "G456");
  assert.strictEqual(handledG456, true);
  assert.strictEqual(replies.length, 1);
  assert.ok(replies[0].text.includes("không có quyền sử dụng chức năng giao việc"));
});

runTest("Nhân viên bị chặn giao việc khi kích hoạt chế độ giới hạn trong Settings", () => {
  // Cấu hình Giới hạn giao việc = Có
  mockSettingsData.push(["Giới hạn giao việc", "Có", ""]);
  
  const event = { replyToken: "token_limit1" };
  const handled = mockSandbox.handleTextCommand(event, "/gv", "U222", "G123");
  assert.strictEqual(handled, true);
  assert.strictEqual(replies.length, 1);
  assert.ok(replies[0].text.includes("không có quyền sử dụng chức năng giao việc"));
  
  // Dọn dẹp cấu hình giới hạn
  mockSettingsData.pop();
});

runTest("Nhân viên xem thành công việc của mình nhưng bị chặn xem báo cáo nhóm", () => {
  // Xem việc của tôi: Thành công
  const eventMyTasks = { replyToken: "token_mytasks" };
  const handledMyTasks = mockSandbox.handleTextCommand(eventMyTasks, "/vieccuatoi", "U222", "G123");
  assert.strictEqual(handledMyTasks, true);
  assert.strictEqual(flexMessages.length, 1);
  
  // Xem báo cáo chưa xong: Thất bại
  const eventChuaXong = { replyToken: "token_chuaxong" };
  const handledChuaXong = mockSandbox.handleTextCommand(eventChuaXong, "/chuaxong", "U222", "G123");
  assert.strictEqual(handledChuaXong, true);
  assert.strictEqual(replies.length, 1);
  assert.ok(replies[0].text.includes("không có quyền xem báo cáo"));
});

runTest("Quản lý xem thành công báo cáo nhóm và toàn hệ thống", () => {
  // Xem báo cáo chưa xong trong nhóm G123: Thành công
  const eventChuaXong = { replyToken: "token_manager1" };
  const handledChuaXong = mockSandbox.handleTextCommand(eventChuaXong, "/chuaxong", "U_QuanLy", "G123");
  assert.strictEqual(handledChuaXong, true);
  assert.strictEqual(flexMessages.length, 1);
  
  // Xem báo cáo hôm nay toàn hệ thống (chat riêng): Thành công
  const eventHomNay = { replyToken: "token_manager2" };
  const handledHomNay = mockSandbox.handleTextCommand(eventHomNay, "/viechomnay", "U_QuanLy", null);
  assert.strictEqual(handledHomNay, true);
  assert.strictEqual(flexMessages.length, 2); // 1 from previous tests, 1 new
});

runTest("Quyền Hủy việc (/huy) và Giao lại việc (/giaolai) đối với từng nhóm phân quyền", () => {
  // Lấy dòng 2 trong mockEventsData: "Công việc test 1" (groupId: G123, creator: U111)
  
  // 1. Quản lý hủy việc: Thành công
  const eventCancelManager = { replyToken: "token_huy_ql" };
  const handledCancelManager = mockSandbox.handleTextCommand(eventCancelManager, "/huy 2", "U_QuanLy", "G123");
  assert.strictEqual(handledCancelManager, true);
  assert.strictEqual(replies.length, 1);
  assert.ok(replies[0].text.includes("Đã hủy công việc dòng 2 thành công"));
  
  // Khôi phục trạng thái việc để test tiếp
  mockEventsData[1][12] = "Đang làm";
  
  // 2. Tổ trưởng Hùng (quản lý G123) hủy việc: Thành công
  const eventCancelLeaderOk = { replyToken: "token_huy_tt_ok" };
  const handledCancelLeaderOk = mockSandbox.handleTextCommand(eventCancelLeaderOk, "/huy 2", "U_ToTruong", "G123");
  assert.strictEqual(handledCancelLeaderOk, true);
  assert.strictEqual(replies.length, 2);
  assert.ok(replies[1].text.includes("Đã hủy công việc dòng 2 thành công"));
  
  // Khôi phục trạng thái việc
  mockEventsData[1][12] = "Đang làm";
  
  // 3. Tổ trưởng Tuấn (quản lý G456) hủy việc ở nhóm G123: Thất bại
  const eventCancelLeaderFail = { replyToken: "token_huy_tt_fail" };
  const handledCancelLeaderFail = mockSandbox.handleTextCommand(eventCancelLeaderFail, "/huy 2", "U_ToTruongKhac", "G123");
  assert.strictEqual(handledCancelLeaderFail, true);
  assert.strictEqual(replies.length, 3);
  assert.ok(replies[2].text.includes("không có quyền hủy công việc"));
  
  // 4. Nhân viên hủy việc: Thất bại
  const eventCancelStaff = { replyToken: "token_huy_nv" };
  const handledCancelStaff = mockSandbox.handleTextCommand(eventCancelStaff, "/huy 2", "U222", "G123");
  assert.strictEqual(handledCancelStaff, true);
  assert.strictEqual(replies.length, 4);
  assert.ok(replies[3].text.includes("không có quyền hủy công việc"));
  
  // 5. Tổ trưởng Hùng giao lại việc dòng 2 cho U222: Thành công
  const eventReassignOk = { replyToken: "token_giaolai_ok" };
  const handledReassignOk = mockSandbox.handleTextCommand(eventReassignOk, "/giaolai 2 U222", "U_ToTruong", "G123");
  assert.strictEqual(handledReassignOk, true);
  assert.strictEqual(replies.length, 5);
  assert.ok(replies[4].text.includes("Đã giao lại công việc dòng 2 cho Nhân Viên Nhận Việc"));
});

runTest("Lệnh /role hiển thị đúng vai trò và danh sách nhóm phụ trách", () => {
  // Lệnh /role của Tổ trưởng Hùng
  const event = { replyToken: "token_role1" };
  const handled = mockSandbox.handleTextCommand(event, "/role", "U_ToTruong", "G123");
  assert.strictEqual(handled, true);
  assert.strictEqual(replies.length, 1);
  assert.ok(replies[0].text.includes("Vai trò: Tổ trưởng"));
  assert.ok(replies[0].text.includes("Nhóm phụ trách: G123"));
});

runTest("Lệnh /addadmin hoạt động chính xác đối với tài khoản Admin và bị chặn đối với tài khoản thường", () => {
  // 1. Nhân viên thêm admin: Thất bại
  const eventFail = { replyToken: "token_addadmin_fail" };
  const handledFail = mockSandbox.handleTextCommand(eventFail, "/addadmin U_Moi", "U222", null);
  assert.strictEqual(handledFail, true);
  assert.strictEqual(replies.length, 1);
  assert.ok(replies[0].text.includes("không có quyền Admin"));
  
  // 2. Admin thêm admin: Thành công
  const eventOk = { replyToken: "token_addadmin_ok" };
  const handledOk = mockSandbox.handleTextCommand(eventOk, "/addadmin U_Moi", "Ua5509d3b3780ee833633e8b4ad332b70", null);
  assert.strictEqual(handledOk, true);
  assert.strictEqual(replies.length, 2);
  assert.ok(replies[1].text.includes("Đã gán quyền Admin thành công"));
  
  // Kiểm tra vai trò của U_Moi trong sheet User_Roles
  assert.strictEqual(mockSandbox.getUserRole("U_Moi"), "Admin");
});

runTest("Trạng thái Tạm khóa trong User_Roles hạ quyền người dùng xuống Khách", () => {
  // U_BiKhoa bị khóa, vai trò trả về phải là Khách
  assert.strictEqual(mockSandbox.getUserRole("U_BiKhoa"), "Khách");
  
  // Xem việc của tôi: Bị chặn vì vai trò Khách
  const event = { replyToken: "token_blocked" };
  const handled = mockSandbox.handleTextCommand(event, "/vieccuatoi", "U_BiKhoa", "G123");
  assert.strictEqual(handled, true);
  assert.strictEqual(replies.length, 1);
  assert.ok(replies[0].text.includes("không có quyền sử dụng chức năng này"));
});

console.log("\n--- PHẦN G: TEST MIGRATION & TASK ID & TASK LOGS ---");

runTest("Khởi tạo bảng trên file mới / trống (gọi ensureSheetAndHeaders)", () => {
  // 1. Sao lưu dữ liệu hiện tại
  const backup = JSON.parse(JSON.stringify(allSheetsData));
  
  // 2. Clear registry để giả lập spreadsheet hoàn toàn trống
  for (let key in allSheetsData) {
    delete allSheetsData[key];
  }
  
  // 3. Chạy ensureSheetAndHeaders
  mockSandbox.ensureSheetAndHeaders();
  
  // 4. Kiểm tra các sheet mới đã được tạo với đầy đủ headers mong đợi
  assert.ok(allSheetsData["Sự kiện"]);
  assert.strictEqual(allSheetsData["Sự kiện"][0][0], "Task ID");
  assert.ok(allSheetsData["Settings"]);
  assert.strictEqual(allSheetsData["Settings"][0][0], "Key");
  assert.ok(allSheetsData["Task_Logs"]);
  assert.strictEqual(allSheetsData["Task_Logs"][0][1], "Task ID");
  assert.ok(allSheetsData["Task_Comments"]);
  assert.ok(allSheetsData["Task_Templates"]);
  assert.ok(allSheetsData["Daily_Report"]);
  
  // 5. Khôi phục lại dữ liệu registry
  for (let key in backup) {
    allSheetsData[key] = backup[key];
  }
});

runTest("Khởi tạo bảng trên file có dữ liệu cũ (migration thêm cột Task ID)", () => {
  // 1. Sao lưu dữ liệu hiện tại
  const backup = JSON.parse(JSON.stringify(allSheetsData));
  
  // 2. Đặt sheet Sự kiện về dữ liệu 23 cột cũ (không có Task ID)
  allSheetsData["Sự kiện"] = [
    [
      "Tên sự kiện", "Nội dung", "Ngày giờ gửi", "Link ảnh đính kèm", "Lặp lại", "Nhóm nhận", 
      "Người phụ trách", "Tần suất (phút)", "Hình thức xác nhận", "Độ ưu tiên", "Người xác nhận", 
      "Trạng thái", "Lần nhắc cuối", "Số lần nhắc", "Link Ảnh Nghiệm Thu", "Deadline", 
      "Loại công việc", "Người giao việc", "Người theo dõi", "Ghi chú", "Trạng thái xử lý chi tiết", 
      "Lịch sử cập nhật", "Đã nhắc trước deadline"
    ],
    [
      "Công việc cũ 1", "Nội dung cũ", "2026-06-11 12:00", "", "Không", "G123", 
      "U222", "0", "Nút bấm", "Bình thường", "", 
      "Đang làm", "", "0", "", new Date("2026-06-12T12:00:00"), 
      "Kiểm tra", "U111", "", "", "Đang làm", 
      "", ""
    ]
  ];
  
  // Đặt sheet Settings về dạng cũ có "Tham số" và "Giá trị"
  allSheetsData["Settings"] = [
    ["Tham số", "Giá trị", "Mô tả"],
    ["Giới hạn giao việc", "Không", ""]
  ];
  
  // 3. Chạy ensureSheetAndHeaders
  mockSandbox.ensureSheetAndHeaders();
  
  // 4. Kiểm tra xem cột Task ID đã được chèn vào Cột A của Sự kiện chưa
  assert.strictEqual(allSheetsData["Sự kiện"][0][0], "Task ID");
  assert.strictEqual(allSheetsData["Sự kiện"][0][1], "Tên sự kiện");
  assert.strictEqual(allSheetsData["Sự kiện"].length, 2);
  
  // Kiểm tra Task ID tự động tạo cho dòng cũ
  const generatedId = allSheetsData["Sự kiện"][1][0];
  assert.ok(generatedId);
  assert.ok(generatedId.startsWith("TASK-"));
  
  // Kiểm tra Settings đã được đổi tên cột thành Key và Value
  assert.strictEqual(allSheetsData["Settings"][0][0], "Key");
  assert.strictEqual(allSheetsData["Settings"][0][1], "Value");
  
  // 5. Khôi phục lại dữ liệu registry
  for (let key in backup) {
    allSheetsData[key] = backup[key];
  }
});

runTest("Kiểm tra sinh Task ID ngẫu nhiên định dạng TASK-YYYYMMDD-HHMMSS-RAND", () => {
  const d = new Date("2026-06-11T12:34:56");
  const taskId = mockSandbox.generateTaskId(d);
  console.log(`      Sinh thử Task ID: ${taskId}`);
  assert.ok(taskId.startsWith("TASK-20260611-123456-"));
  assert.strictEqual(taskId.length, 25); // TASK- (5) + YYYYMMDD (8) + - (1) + HHMMSS (6) + - (1) + RAND (4) = 25
});

runTest("Ghi nhận log khi thay đổi trạng thái công việc (qua lệnh /huy)", () => {
  // Đảm bảo trạng thái dòng 2 là Đang làm trước khi test
  allSheetsData["Sự kiện"][1][12] = "Đang làm";
  
  // Clear Task_Logs
  allSheetsData["Task_Logs"] = [["Thời gian", "Task ID", "Hành động", "Người thực hiện", "Nội dung cũ", "Nội dung mới", "Ghi chú"]];
  
  // Lấy Task ID của dòng 2
  const taskId = allSheetsData["Sự kiện"][1][0]; // TASK-20260611-120000-0001
  
  // Thực hiện lệnh /huy 2
  const event = { replyToken: "token_huy_log" };
  mockSandbox.handleTextCommand(event, "/huy 2", "U_QuanLy", "G123");
  
  // Kiểm tra log ghi nhận trong Task_Logs
  assert.strictEqual(allSheetsData["Task_Logs"].length, 2);
  const logRow = allSheetsData["Task_Logs"][1];
  assert.strictEqual(logRow[1], taskId); // Task ID
  assert.strictEqual(logRow[2], "Hủy việc"); // Hành động
  assert.strictEqual(logRow[3], "Quản lý Minh"); // Người thực hiện (uId="U_QuanLy" name="Quản lý Minh")
  assert.strictEqual(logRow[4], "Đang làm"); // Nội dung cũ (trạng thái cũ)
  assert.strictEqual(logRow[5], "Đã hủy"); // Nội dung mới
});

runTest("Upload 5 ảnh từ form LIFF", () => {
  const data = {
    ten: "Viec nhieu anh",
    noiDung: "Nội dung",
    ngayGio: "2026-06-12 10:00",
    lapLai: "Không",
    idGroup: "G123",
    idMember: "U222",
    tanSuat: 15,
    hinhThucXN: "Gửi ảnh",
    doUuTien: "Bình thường",
    deadline: "2026-06-12 12:00",
    loaiCV: "Khác",
    idAssigner: "U111",
    idFollower: "",
    ghiChu: "Test upload nhieu anh",
    imageFiles: [
      { dataUrl: "data:image/jpeg;base64,AAA", type: "image/jpeg", name: "anh1.jpg" },
      { dataUrl: "data:image/jpeg;base64,BBB", type: "image/jpeg", name: "anh2.jpg" }
    ]
  };
  
  const res = mockSandbox.createTaskFromLIFF(data);
  console.log("createTaskFromLIFF result:", res);
  assert.strictEqual(res.success, true);
  
  const lastRow = allSheetsData["Sự kiện"][allSheetsData["Sự kiện"].length - 1];
  assert.strictEqual(lastRow[1], "Viec nhieu anh");
  assert.ok(lastRow[4].includes("\n"));
  assert.ok(lastRow[4].includes("https://lh3.googleusercontent.com/d/mock_file_id"));
});

runTest("Cảnh báo khi upload Rich Menu > 1MB", () => {
  const originalGetFileById = mockSandbox.DriveApp.getFileById;
  const originalGetUi = mockSandbox.SpreadsheetApp.getUi;
  
  mockSandbox.DriveApp.getFileById = function(id) {
    console.log("Mock getFileById called for ID:", id);
    return {
      getSize: function() { return 1.5 * 1024 * 1024; },
      getBlob: function() {
        return {
          getContentType: function() { return "image/png"; },
          getBytes: function() { return [1, 2, 3]; }
        };
      }
    };
  };

  const alertCalls = [];
  mockSandbox.SpreadsheetApp.getUi = function() {
    return {
      ButtonSet: { YES_NO: "YES_NO", OK_CANCEL: "OK_CANCEL" },
      Button: { YES: "YES", NO: "NO", OK: "OK", CANCEL: "CANCEL" },
      alert: function(title, prompt, buttonSet) {
        console.log("Mock local alert called with:", title, prompt);
        alertCalls.push({ title, prompt, buttonSet });
        return "YES";
      },
      prompt: function(title, prompt, buttonSet) {
        return {
          getSelectedButton: function() { return "OK"; },
          getResponseText: function() { return "mock_file_id"; }
        };
      }
    };
  };
  
  try {
    mockSandbox.UPLOAD_RICH_MENU_IMAGE_FROM_DRIVE();
  } catch (err) {
    console.error("ERROR IN UPLOAD_RICH_MENU_IMAGE_FROM_DRIVE TEST:", err);
  }
  
  console.log("Captured alerts:", alertCalls);
  const sizeAlert = alertCalls.find(a => a.title && a.title.includes("⚠️ Cảnh báo dung lượng"));
  assert.ok(sizeAlert, "Should have triggered a size warning alert");
  
  mockSandbox.DriveApp.getFileById = originalGetFileById;
  mockSandbox.SpreadsheetApp.getUi = originalGetUi;
});

runTest("Gửi ảnh nghiệm thu trong nhóm khi có nhiều việc chờ", () => {
  allSheetsData["Sự kiện"].push([
    "TASK-1", "Viec 1", "", "2026-06-12 12:00", "", "Không", "G123", "U222", "15", "Gửi ảnh", "Bình thường", "Nhân Viên Nhận Việc", "Chờ gửi ảnh", "", "0", "", new Date("2026-06-12T14:00:00"), "Khác", "U111", "", "", "", "", ""
  ]);
  allSheetsData["Sự kiện"].push([
    "TASK-2", "Viec 2", "", "2026-06-12 12:00", "", "Không", "G123", "U222", "15", "Gửi ảnh", "Bình thường", "Nhân Viên Nhận Việc", "Chờ gửi ảnh", "", "0", "", new Date("2026-06-12T14:00:00"), "Khác", "U111", "", "", "", "", ""
  ]);
  
  const event = {
    type: "message",
    replyToken: "token_multi_photo",
    source: {
      userId: "U222",
      groupId: "G123"
    },
    message: {
      type: "image",
      id: "msg_image_999"
    }
  };
  
  const postData = { events: [event] };
  mockSandbox.doPost({ postData: { contents: JSON.stringify(postData) } });
  
  assert.strictEqual(flexMessages.length, 1);
  assert.strictEqual(flexMessages[0].altText, "Chọn việc cần nghiệm thu ảnh");
  const flexBody = flexMessages[0].messages[0].contents.body.contents;
  const buttons = flexBody.filter(b => b.type === "box" && b.contents.some(c => c.type === "button"));
  assert.strictEqual(buttons.length, 2);
  assert.ok(buttons[0].contents[0].text.includes("Viec 1"));
  assert.ok(buttons[1].contents[0].text.includes("Viec 2"));
});

runTest("Postback action=confirm_image xác nhận nghiệm thu việc", () => {
  const postbackEvent = {
    type: "postback",
    replyToken: "token_postback_confirm",
    source: {
      userId: "U222",
      groupId: "G123"
    },
    postback: {
      data: "action=confirm_image&row=7&msgId=msg_image_999"
    }
  };
  
  mockSandbox.doPost({ postData: { contents: JSON.stringify({ events: [postbackEvent] }) } });
  
  const row7 = allSheetsData["Sự kiện"][6];
  assert.strictEqual(row7[12], "Đã gửi");
  assert.ok(row7[15].includes("mock_file_id"));
  
  assert.strictEqual(replies.length, 1);
  assert.ok(replies[0].text.includes("Đã nghiệm thu ảnh thành công cho việc: Viec 1"));
});

// ----------------------------------------------------
// PHẦN H: TEST BẢO MẬT, RETRY, STATUS /BOT & ROLLBACK
// ----------------------------------------------------
console.log("\n--- PHẦN H: BẢO MẬT, RETRY, STATUS /BOT & ROLLBACK ---");

runTest("Xóa token rồi test báo lỗi rõ", () => {
  const originalToken = mockScriptProperties['LINE_CHANNEL_ACCESS_TOKEN'];
  delete mockScriptProperties['LINE_CHANNEL_ACCESS_TOKEN'];
  
  assert.throws(() => {
    mockSandbox.getToken();
  }, /missing|chưa được cấu hình|LINE_CHANNEL_ACCESS_TOKEN is missing/i);
  
  mockScriptProperties['LINE_CHANNEL_ACCESS_TOKEN'] = originalToken;
});

runTest("Cài token lại rồi test gửi", () => {
  mockScriptProperties['LINE_CHANNEL_ACCESS_TOKEN'] = "new-valid-token-123";
  const token = mockSandbox.getToken();
  assert.strictEqual(token, "new-valid-token-123");
});

runTest("Test lệnh /bot hiển thị trạng thái hệ thống đầy đủ", () => {
  // Clear logs sheet
  allSheetsData["Logs"] = [
    ["Thời gian", "Loại", "Hàm", "Nội dung", "Payload rút gọn"],
    ["2026-06-12 10:00:00", "ERROR", "test", "Lỗi test 1", ""],
    ["2026-06-12 10:01:00", "INFO", "test", "Info test 1", ""],
    ["2026-06-12 10:02:00", "ERROR", "test", "Lỗi test 2", ""]
  ];
  
  const flex = mockSandbox.buildBotStatusFlexMessage();
  assert.strictEqual(flex.type, "flex");
  assert.strictEqual(flex.altText, "Trạng thái hệ thống Bot");
  
  const bodyContents = flex.contents.body.contents[0].contents;
  
  // Kiểm tra xem có chứa text "Số log lỗi" và giá trị lỗi là 2
  const errorLogTextFound = bodyContents.some(box => {
    return box.contents && box.contents[0].text.includes("Số log lỗi") && box.contents[1].text === "2";
  });
  assert.ok(errorLogTextFound, "Should report 2 error logs in status Flex message");
  
  // Kiểm tra xem có chứa text "Giờ server"
  const serverTimeFound = bodyContents.some(box => {
    return box.contents && box.contents[0].text.includes("Giờ server");
  });
  assert.ok(serverTimeFound, "Should report Server Time in status Flex message");
});

runTest("Test trigger mất rồi tạo lại", () => {
  // Xóa sạch trigger
  mockTriggers.length = 0;
  
  // Chạy setup
  mockSandbox.SETUP_TRIGGERS();
  
  // Xác nhận trigger được tạo lại
  assert.strictEqual(mockTriggers.length, 3);
  assert.strictEqual(mockTriggers[0].getHandlerFunction(), "checkAndSendLineMessage");
  assert.strictEqual(mockTriggers[1].getHandlerFunction(), "guiBaoCaoCuoiNgayTuDong");
  assert.strictEqual(mockTriggers[2].getHandlerFunction(), "guiBaoCaoTuanTuDong");
});

runTest("Test LINE API lỗi tạm thời (HTTP 500) có log và retry thành công", () => {
  const originalFetch = mockSandbox.UrlFetchApp.fetch;
  let fetchAttempts = 0;
  
  mockSandbox.UrlFetchApp.fetch = function(url, options) {
    fetchAttempts++;
    if (fetchAttempts === 1) {
      return {
        getResponseCode: () => 500,
        getContentText: () => "Internal Server Error"
      };
    }
    return {
      getResponseCode: () => 200,
      getContentText: () => JSON.stringify({ message: "OK" })
    };
  };
  
  // Reset logs
  allSheetsData["Logs"] = [["Thời gian", "Loại", "Hàm", "Nội dung", "Payload rút gọn"]];
  
  const res = mockSandbox.callLineApi("message/push", { method: "post" }, "Test retry");
  
  assert.strictEqual(fetchAttempts, 2, "Should have retried once (total 2 attempts)");
  assert.strictEqual(JSON.parse(res.getContentText()).message, "OK");
  
  // Kiểm tra xem log lỗi 500 có được ghi lại
  const hasErrorLog = allSheetsData["Logs"].some(row => row[1] === "ERROR" && row[3].includes("HTTP 500"));
  assert.ok(hasErrorLog, "Should have logged the HTTP 500 error attempt");
  
  mockSandbox.UrlFetchApp.fetch = originalFetch;
});

runTest("Test LINE API lỗi client (HTTP 400) không retry và ném lỗi ngay", () => {
  const originalFetch = mockSandbox.UrlFetchApp.fetch;
  let fetchAttempts = 0;
  
  mockSandbox.UrlFetchApp.fetch = function(url, options) {
    fetchAttempts++;
    return {
      getResponseCode: () => 400,
      getContentText: () => "Bad Request"
    };
  };
  
  assert.throws(() => {
    mockSandbox.callLineApi("message/push", { method: "post" }, "Test error client");
  }, /HTTP 400/);
  
  assert.strictEqual(fetchAttempts, 1, "Should not retry HTTP 400 error");
  
  mockSandbox.UrlFetchApp.fetch = originalFetch;
});

runTest("Test Rollback cấu hình hoạt động chính xác", () => {
  mockScriptProperties['LINE_CHANNEL_ACCESS_TOKEN'] = "token-initial";
  mockScriptProperties['BACKUP_LINE_CHANNEL_ACCESS_TOKEN'] = "token-backup";
  
  // Chạy rollback
  mockSandbox.ROLLBACK_CAU_HINH_MENU();
  
  // Xác nhận giá trị đã được đảo ngược
  assert.strictEqual(mockScriptProperties['LINE_CHANNEL_ACCESS_TOKEN'], "token-backup");
  assert.strictEqual(mockScriptProperties['BACKUP_LINE_CHANNEL_ACCESS_TOKEN'], "token-initial");
});

console.log("\n🎉 TẤT CẢ CÁC TEST CASES ĐÃ THÀNH CÔNG RỰC RỠ!");

