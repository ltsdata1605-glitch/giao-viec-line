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
  "Task_Templates": [["Tên mẫu", "Loại công việc", "Tiêu đề mẫu", "Nội dung mẫu", "Ưu tiên mặc định", "Hình thức xác nhận mặc định"]],
  "Interaction_Logs": [
    ["Thời gian", "Ngày", "Giờ", "Group ID", "Group Name", "User ID", "Tên Line", "Loại tương tác", "Nội dung rút gọn", "Task ID", "Điểm tương tác", "Nguồn", "Ghi chú"]
  ],
  "Group_Settings": [
    ["Group ID", "Group Name", "Bật cảnh báo im lặng", "Số phút im lặng", "Giờ bắt đầu theo dõi", "Giờ kết thúc theo dõi", "Lần cảnh báo cuối", "Trạng thái", "Bật báo cáo cuối ngày", "Giờ gửi báo cáo", "Lần gửi báo cáo cuối", "Bật cảnh báo bất thường", "Ngưỡng giảm tương tác (%)", "Ngưỡng việc quá hạn", "Lần cảnh báo bất thường cuối"]
  ],
  "Dashboard_TuongTac": [
    ["Dashboard Thống Kê Tương Tác"]
  ]
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
      if (format === "HH:mm") {
        return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
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
      
      if (url.includes("/members/count")) {
        let count = 12;
        if (url.includes("G_EMPTY")) count = 0;
        return {
          getResponseCode: () => 200,
          getContentText: () => JSON.stringify({ count })
        };
      }
      
      if (url.includes("/summary")) {
        let groupName = "Nhóm Test LINE";
        if (url.includes("G_REP_1")) groupName = "Group Báo Cáo";
        else if (url.includes("G_LIMIT_10")) groupName = "Group Giới Hạn";
        return {
          getResponseCode: () => 200,
          getContentText: () => JSON.stringify({ groupName: groupName })
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
      let rStart = 0;
      let cStart = 0;
      let actualRows = 1;
      let actualCols = 1;
      
      if (typeof row === "string") {
        const cleanRange = row.toUpperCase().trim();
        const parts = cleanRange.split(":");
        
        function parseCell(cellStr) {
          const match = cellStr.match(/^([A-Z]+)([0-9]+)$/);
          if (!match) return { r: 1, c: 1 };
          const colLetters = match[1];
          const rowNumber = parseInt(match[2], 10);
          
          let colNumber = 0;
          for (let i = 0; i < colLetters.length; i++) {
            colNumber = colNumber * 26 + (colLetters.charCodeAt(i) - 64);
          }
          return { r: rowNumber, c: colNumber };
        }
        
        const cell1 = parseCell(parts[0]);
        rStart = cell1.r - 1;
        cStart = cell1.c - 1;
        
        if (parts.length > 1) {
          const cell2 = parseCell(parts[1]);
          actualRows = cell2.r - cell1.r + 1;
          actualCols = cell2.c - cell1.c + 1;
        } else {
          actualRows = 1;
          actualCols = 1;
        }
      } else {
        rStart = row - 1;
        cStart = col - 1;
        actualRows = numRows !== undefined ? numRows : 1;
        actualCols = numCols !== undefined ? numCols : 1;
      }
      
      const rangeObj = {
        getValues: function() {
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
        getValue: function() {
          return (rawData[rStart] && rawData[rStart][cStart] !== undefined) ? rawData[rStart][cStart] : "";
        },
        setValue: function(val) {
          if (!rawData[rStart]) rawData[rStart] = [];
          rawData[rStart][cStart] = val;
          return this;
        },
        setValues: function(valuesArray) {
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
          return this;
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
        },
        setFontSize: function(size) {
          return this;
        },
        setFontColor: function(color) {
          return this;
        },
        setHorizontalAlignment: function(align) {
          return this;
        },
        setVerticalAlignment: function(align) {
          return this;
        },
        setBorder: function() {
          return this;
        },
        merge: function() {
          return this;
        },
        setWrap: function() {
          return this;
        },
        setDataValidation: function() {
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
    },
    setColumnWidth: function(col, width) {
      return this;
    },
    setRowHeight: function(row, height) {
      return this;
    },
    clear: function() {
      rawData.length = 0;
      return this;
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
  },
  deleteSheet: function(sheet) {
    if (sheet && typeof sheet.getName === "function") {
      delete allSheetsData[sheet.getName()];
    }
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
  // Có 5 trigger được tạo ra: checkAndSendLineMessage, guiBaoCaoCuoiNgayTuDong, guiBaoCaoTuanTuDong, checkSilentGroups, checkAndSendDailyInteractionReports
  assert.strictEqual(mockTriggers.length, 5);
  assert.strictEqual(mockTriggers[0].getHandlerFunction(), "checkAndSendLineMessage");
  assert.strictEqual(mockTriggers[1].getHandlerFunction(), "guiBaoCaoCuoiNgayTuDong");
  assert.strictEqual(mockTriggers[2].getHandlerFunction(), "guiBaoCaoTuanTuDong");
  assert.strictEqual(mockTriggers[3].getHandlerFunction(), "checkSilentGroups");
  assert.strictEqual(mockTriggers[4].getHandlerFunction(), "checkAndSendDailyInteractionReports");
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
  assert.strictEqual(mockTriggers.length, 5);
  assert.strictEqual(mockTriggers[0].getHandlerFunction(), "checkAndSendLineMessage");
  assert.strictEqual(mockTriggers[1].getHandlerFunction(), "guiBaoCaoCuoiNgayTuDong");
  assert.strictEqual(mockTriggers[2].getHandlerFunction(), "guiBaoCaoTuanTuDong");
  assert.strictEqual(mockTriggers[3].getHandlerFunction(), "checkSilentGroups");
  assert.strictEqual(mockTriggers[4].getHandlerFunction(), "checkAndSendDailyInteractionReports");
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

// --- PHẦN I: THỐNG KÊ TƯƠNG TÁC NHÓM (INTERACTION LOGS) ---
console.log("\n--- PHẦN I: THỐNG KÊ TƯƠNG TÁC NHÓM (INTERACTION LOGS) ---");

runTest("Test gửi tin nhắn thường trong nhóm", () => {
  const originalInteractionLogsLength = allSheetsData["Interaction_Logs"].length;
  const originalTuongTacLength = allSheetsData["Tương Tác"].length;
  const today = new Date().toDateString();
  const existingRow = allSheetsData["Tương Tác"].find(r => r[0] === today && r[1] === "G123" && r[2] === "U222");
  const originalTotal = existingRow ? existingRow[7] : 0;
  
  const webhookEvent = {
    events: [{
      type: "message",
      message: {
        type: "text",
        text: "Hello World",
        id: "msg-1111"
      },
      source: {
        userId: "U222",
        groupId: "G123"
      },
      replyToken: "reply-1111"
    }]
  };
  
  mockSandbox.doPost({ postData: { contents: JSON.stringify(webhookEvent) } });
  
  // Kiểm tra sheet Interaction_Logs có ghi nhận loại 'text'
  const logs = allSheetsData["Interaction_Logs"];
  assert.strictEqual(logs.length, originalInteractionLogsLength + 1, "Should have appended a row to Interaction_Logs");
  const lastLog = logs[logs.length - 1];
  assert.strictEqual(lastLog[3], "G123", "Group ID should be G123");
  assert.strictEqual(lastLog[5], "U222", "User ID should be U222");
  assert.strictEqual(lastLog[7], "text", "Type should be text");
  assert.strictEqual(lastLog[8], "Hello World", "Content should match original text");
  assert.strictEqual(lastLog[10], 1.0, "Score should be 1.0");
  assert.strictEqual(lastLog[11], "Webhook", "Source should be Webhook");

  // Kiểm tra sheet Tương Tác vẫn cập nhật
  const updatedRow = allSheetsData["Tương Tác"].find(r => r[0] === today && r[1] === "G123" && r[2] === "U222");
  assert.ok(updatedRow, "Should have a row for today in legacy Tương Tác sheet");
  const updatedTotal = updatedRow[7];
  
  if (existingRow) {
    assert.strictEqual(allSheetsData["Tương Tác"].length, originalTuongTacLength, "Sheet length should remain same");
    assert.strictEqual(updatedTotal, originalTotal + 1, "Total count should have incremented by 1");
  } else {
    assert.strictEqual(allSheetsData["Tương Tác"].length, originalTuongTacLength + 1, "Sheet length should have increased by 1");
    assert.strictEqual(updatedTotal, 1, "Total count should be 1");
  }
});

runTest("Test gửi sticker trong nhóm", () => {
  const originalInteractionLogsLength = allSheetsData["Interaction_Logs"].length;
  
  const webhookEvent = {
    events: [{
      type: "message",
      message: {
        type: "sticker",
        packageId: "1",
        stickerId: "10",
        id: "msg-2222"
      },
      source: {
        userId: "U222",
        groupId: "G123"
      },
      replyToken: "reply-2222"
    }]
  };
  
  mockSandbox.doPost({ postData: { contents: JSON.stringify(webhookEvent) } });
  
  const logs = allSheetsData["Interaction_Logs"];
  assert.strictEqual(logs.length, originalInteractionLogsLength + 1, "Should have appended a row to Interaction_Logs");
  const lastLog = logs[logs.length - 1];
  assert.strictEqual(lastLog[7], "sticker", "Type should be sticker");
  assert.strictEqual(lastLog[10], 0.5, "Score should be 0.5");
});

runTest("Test gửi tin nhắn ảnh thường trong nhóm (không có việc chờ)", () => {
  const originalInteractionLogsLength = allSheetsData["Interaction_Logs"].length;
  
  // Set all status to Completed so there are no matching pending tasks
  allSheetsData["Sự kiện"].forEach((row, idx) => {
    if (idx > 0) {
      row[12] = "Đã gửi"; // status
    }
  });

  const webhookEvent = {
    events: [{
      type: "message",
      message: {
        type: "image",
        id: "msg-3333"
      },
      source: {
        userId: "U222",
        groupId: "G123"
      },
      replyToken: "reply-3333"
    }]
  };
  
  mockSandbox.doPost({ postData: { contents: JSON.stringify(webhookEvent) } });
  
  const logs = allSheetsData["Interaction_Logs"];
  console.log("ACTUAL INTERACTION LOGS IN TEST:", JSON.stringify(logs, null, 2));
  assert.strictEqual(logs.length, originalInteractionLogsLength + 1, "Should have appended a row to Interaction_Logs");
  const lastLog = logs[logs.length - 1];
  assert.strictEqual(lastLog[7], "image", "Type should be image (normal)");
  assert.strictEqual(lastLog[10], 2.0, "Score should be 2.0");
});

runTest("Test gửi lệnh bot trong nhóm", () => {
  const originalInteractionLogsLength = allSheetsData["Interaction_Logs"].length;
  
  const webhookEvent = {
    events: [{
      type: "message",
      message: {
        type: "text",
        text: "/help",
        id: "msg-4444"
      },
      source: {
        userId: "U222",
        groupId: "G123"
      },
      replyToken: "reply-4444"
    }]
  };
  
  mockSandbox.doPost({ postData: { contents: JSON.stringify(webhookEvent) } });
  
  const logs = allSheetsData["Interaction_Logs"];
  assert.strictEqual(logs.length, originalInteractionLogsLength + 1, "Should have appended a row to Interaction_Logs");
  const lastLog = logs[logs.length - 1];
  assert.strictEqual(lastLog[7], "command", "Type should be command");
  assert.strictEqual(lastLog[10], 0.2, "Score should be 0.2");
});

runTest("Test bấm postback hoàn tất công việc", () => {
  const originalInteractionLogsLength = allSheetsData["Interaction_Logs"].length;
  
  // Đặt trạng thái dòng 2 (index 1 in array) thành "Đang làm" để chờ hoàn tất
  allSheetsData["Sự kiện"][1][12] = "Đang làm"; // status
  allSheetsData["Sự kiện"][1][0] = "TASK-12345"; // Task ID
  allSheetsData["Sự kiện"][1][1] = "Test Task Title"; // Task Name
  
  const webhookEvent = {
    events: [{
      type: "postback",
      postback: {
        data: "action=hoantat&row=2"
      },
      source: {
        userId: "U222",
        groupId: "G123"
      },
      replyToken: "reply-5555"
    }]
  };
  
  mockSandbox.doPost({ postData: { contents: JSON.stringify(webhookEvent) } });
  
  const logs = allSheetsData["Interaction_Logs"];
  // Bấm hoantat ghi 2 entries: postback_hoantat và task_completed
  assert.strictEqual(logs.length, originalInteractionLogsLength + 2, "Should have appended 2 rows to Interaction_Logs");
  
  const log1 = logs[logs.length - 2];
  const log2 = logs[logs.length - 1];
  
  assert.strictEqual(log1[7], "postback_hoantat", "First entry should be postback_hoantat");
  assert.strictEqual(log1[9], "TASK-12345", "Task ID should match");
  assert.strictEqual(log1[10], 5.0, "Score should be 5.0");
  
  assert.strictEqual(log2[7], "task_completed", "Second entry should be task_completed");
  assert.strictEqual(log2[9], "TASK-12345", "Task ID should match");
  assert.strictEqual(log2[10], 5.0, "Score should be 5.0");
});

runTest("Test bấm postback cần hỗ trợ", () => {
  const originalInteractionLogsLength = allSheetsData["Interaction_Logs"].length;
  
  allSheetsData["Sự kiện"][1][12] = "Đang làm"; // status
  
  const webhookEvent = {
    events: [{
      type: "postback",
      postback: {
        data: "action=support&row=2"
      },
      source: {
        userId: "U222",
        groupId: "G123"
      },
      replyToken: "reply-6666"
    }]
  };
  
  mockSandbox.doPost({ postData: { contents: JSON.stringify(webhookEvent) } });
  
  const logs = allSheetsData["Interaction_Logs"];
  // Bấm support ghi 2 entries: postback_can_hotro và task_help_needed
  assert.strictEqual(logs.length, originalInteractionLogsLength + 2, "Should have appended 2 rows to Interaction_Logs");
  
  const log1 = logs[logs.length - 2];
  const log2 = logs[logs.length - 1];
  
  assert.strictEqual(log1[7], "postback_can_hotro", "First entry should be postback_can_hotro");
  assert.strictEqual(log1[10], 2.0, "Score should be 2.0");
  
  assert.strictEqual(log2[7], "task_help_needed", "Second entry should be task_help_needed");
  assert.strictEqual(log2[10], 2.0, "Score should be 2.0");
});

runTest("Test công việc quá hạn ghi log phạt task_overdue", () => {
  const originalInteractionLogsLength = allSheetsData["Interaction_Logs"].length;
  
  // Set task 2 (index 1 in array) as overdue
  allSheetsData["Sự kiện"][1][12] = "Đang làm"; // status
  allSheetsData["Sự kiện"][1][16] = new Date("2026-06-11T12:00:00"); // deadline
  allSheetsData["Sự kiện"][1][7] = "U222"; // assignee User ID
  allSheetsData["Sự kiện"][1][0] = "TASK-OVERDUE-ID"; // Task ID
  
  // Run checkAndSendLineMessage
  mockSandbox.checkAndSendLineMessage();
  
  const logs = allSheetsData["Interaction_Logs"];
  // Quá hạn việc ghi task_overdue
  assert.strictEqual(logs.length, originalInteractionLogsLength + 1, "Should have appended a row to Interaction_Logs");
  
  const lastLog = logs[logs.length - 1];
  assert.strictEqual(lastLog[5], "U222", "User ID should be U222");
  assert.strictEqual(lastLog[7], "task_overdue", "Type should be task_overdue");
  assert.strictEqual(lastLog[9], "TASK-OVERDUE-ID", "Task ID should match");
  assert.strictEqual(lastLog[10], -5.0, "Score should be -5.0");
  assert.strictEqual(lastLog[11], "System", "Source should be System");
});

runTest("Test báo cáo tương tác nhóm (/tthomnay) có dữ liệu", () => {
  const todayDateStr = new Date().toISOString().substring(0, 10);
  
  // Xóa trắng logs trước
  allSheetsData["Interaction_Logs"] = [
    ["Thời gian", "Ngày", "Giờ", "Group ID", "Group Name", "User ID", "Tên Line", "Loại tương tác", "Nội dung rút gọn", "Task ID", "Điểm tương tác", "Nguồn", "Ghi chú"]
  ];
  
  // Ghi log mẫu
  allSheetsData["Interaction_Logs"].push([
    new Date().toISOString(), todayDateStr, "12:00:00", "G_REP_1", "Group Báo Cáo", "U_MEMBER_1", "Thành viên Một", "text", "Tin nhắn test", "", 1.0, "Webhook", ""
  ]);
  allSheetsData["Interaction_Logs"].push([
    new Date().toISOString(), todayDateStr, "12:05:00", "G_REP_1", "Group Báo Cáo", "U_MEMBER_1", "Thành viên Một", "sticker", "Sticker test", "", 0.5, "Webhook", ""
  ]);
  allSheetsData["Interaction_Logs"].push([
    new Date().toISOString(), todayDateStr, "12:10:00", "G_REP_1", "Group Báo Cáo", "U_MEMBER_2", "Thành viên Hai", "image_proof", "Ảnh nghiệm thu", "TASK-123", 5.0, "Webhook", ""
  ]);
  
  const report = mockSandbox.buildInteractionReport("G_REP_1", 1);
  console.log("REPORT TODAY OUTPUT:\n", report);
  
  assert.ok(report.includes("📊 TƯƠNG TÁC HÔM NAY"));
  assert.ok(report.includes("Group: Group Báo Cáo"));
  assert.ok(report.includes("Hoạt động: 2/12 TV")); // 12 from mock members count
  assert.ok(report.includes("Tổng tương tác: 3 lượt"));
  assert.ok(report.includes("1 Tin nhắn"));
  assert.ok(report.includes("1 Sticker"));
  assert.ok(report.includes("1 Ảnh nghiệm thu"));
  assert.ok(report.includes("Thành viên Một: 2"));
  assert.ok(report.includes("Thành viên Hai: 1"));
});

runTest("Test lệnh /toptt alias hôm nay", () => {
  replies.length = 0;
  const event = {
    replyToken: "token_toptt",
    source: { groupId: "G_REP_1", userId: "U_MEMBER_1" }
  };
  const handled = mockSandbox.handleTextCommand(event, "/toptt", "U_MEMBER_1", "G_REP_1");
  assert.strictEqual(handled, true);
  assert.ok(replies.length > 0);
  assert.ok(replies[0].text.includes("📊 TƯƠNG TÁC HÔM NAY"));
});

runTest("Test báo cáo tương tác nhóm 7 ngày (/tt7ngay)", () => {
  replies.length = 0;
  const event = {
    replyToken: "token_tt7",
    source: { groupId: "G_REP_1", userId: "U_MEMBER_1" }
  };
  const handled = mockSandbox.handleTextCommand(event, "/tt7ngay", "U_MEMBER_1", "G_REP_1");
  assert.strictEqual(handled, true);
  assert.ok(replies.length > 0);
  assert.ok(replies[0].text.includes("📊 TƯƠNG TÁC 7 NGÀY QUA"));
});

runTest("Test báo cáo tương tác nhóm 30 ngày (/tt30ngay)", () => {
  replies.length = 0;
  const event = {
    replyToken: "token_tt30",
    source: { groupId: "G_REP_1", userId: "U_MEMBER_1" }
  };
  const handled = mockSandbox.handleTextCommand(event, "/tt30ngay", "U_MEMBER_1", "G_REP_1");
  assert.strictEqual(handled, true);
  assert.ok(replies.length > 0);
  assert.ok(replies[0].text.includes("📊 TƯƠNG TÁC 30 NGÀY QUA"));
});

runTest("Test báo cáo nhóm không có dữ liệu", () => {
  const report = mockSandbox.buildInteractionReport("G_EMPTY", 1);
  console.log("EMPTY REPORT OUTPUT:\n", report);
  
  assert.ok(report.includes("📊 TƯƠNG TÁC HÔM NAY"));
  assert.ok(report.includes("Hoạt động: 0/0 TV")); // fallback to 0/0
  assert.ok(report.includes("Tổng tương tác: 0 lượt"));
  assert.ok(report.includes("(Không có dữ liệu)"));
  assert.ok(report.includes("Nhận xét: Cần nhắc nhóm tương tác/cập nhật tiến độ."));
});

runTest("Test giới hạn Top 5 thành viên tích cực", () => {
  const todayDateStr = new Date().toISOString().substring(0, 10);
  
  // Tạo 8 thành viên tương tác khác nhau
  allSheetsData["Interaction_Logs"] = [
    ["Thời gian", "Ngày", "Giờ", "Group ID", "Group Name", "User ID", "Tên Line", "Loại tương tác", "Nội dung rút gọn", "Task ID", "Điểm tương tác", "Nguồn", "Ghi chú"]
  ];
  
  for (let idx = 1; idx <= 8; idx++) {
    allSheetsData["Interaction_Logs"].push([
      new Date().toISOString(),
      todayDateStr,
      "12:00:00",
      "G_LIMIT_5",
      "Group Giới Hạn",
      "U_M_" + idx,
      "Thành viên " + idx,
      "text",
      "Tin nhắn " + idx,
      "",
      1.0,
      "Webhook",
      ""
    ]);
  }
  
  const report = mockSandbox.buildInteractionReport("G_LIMIT_5", 1);
  
  // Đếm số dòng hiển thị trong Thành viên tích cực
  const lines = report.split("\n");
  let topCount = 0;
  let inTopSection = false;
  
  lines.forEach(line => {
    if (line.startsWith("🔥 Thành viên tích cực:")) {
      inTopSection = true;
    } else if (line.startsWith("📌 Nhận xét:")) {
      inTopSection = false;
    } else if (inTopSection && /^\d+\./.test(line.trim())) {
      topCount++;
    }
  });
  
  console.log("Top display count:", topCount);
  assert.strictEqual(topCount, 5, "Should display exactly 5 members in TOP list");
});

runTest("Test rút gọn tên nhân viên", () => {
  const shorten = mockSandbox.shortenEmployeeName;
  
  assert.strictEqual(shorten("STR_BOSS SƠN_21707"), "21707 - Sơn");
  assert.strictEqual(shorten("ĐMST- Phụng15887-AIO"), "15887 - Phụng");
  assert.strictEqual(shorten("STR_Trường_21453-TC"), "21453 - Trường");
  assert.strictEqual(shorten("ĐMST-Tuý-7587- TN"), "7587 - Tuý");
  assert.strictEqual(shorten("910_PHÚC_58614_AIO"), "58614 - Phúc");
  assert.strictEqual(shorten("ĐMST_THẢO_58619_TV"), "58619 - Thảo");
  assert.strictEqual(shorten("DMX-HƯƠNG-17952-AIO"), "17952 - Hương");
  assert.strictEqual(shorten("Nhân viên"), "Nhân viên");
});

runTest("Test phát hiện thành viên im lặng trong nhóm", () => {
  const todayDateStr = new Date().toISOString().substring(0, 10);
  
  // Thiết lập sheet ID_Member để có 4 thành viên đã đăng ký
  allSheetsData["ID_Member"] = [
    ["Tên Line", "ID Line"],
    ["Thành viên A", "U_A"],
    ["Thành viên B", "U_B"],
    ["Thành viên C", "U_C"],
    ["Thành viên D", "U_D"]
  ];
  
  // Thiết lập sheet Interaction_Logs để ghi nhận các thành viên thuộc nhóm G_SILENT
  allSheetsData["Interaction_Logs"] = [
    ["Thời gian", "Ngày", "Giờ", "Group ID", "Group Name", "User ID", "Tên Line", "Loại tương tác", "Nội dung rút gọn", "Task ID", "Điểm tương tác", "Nguồn", "Ghi chú"]
  ];
  
  // Cả 4 thành viên từng xuất hiện trong nhóm G_SILENT này
  // Nhưng hôm nay (chỉ có A và B tương tác)
  // C và D không tương tác
  allSheetsData["Interaction_Logs"].push([
    "2026-06-11 12:00:00", "2026-06-11", "12:00:00", "G_SILENT", "Group Im Lặng", "U_C", "Thành viên C", "text", "Tin cũ", "", 1, "Webhook", ""
  ]);
  allSheetsData["Interaction_Logs"].push([
    "2026-06-11 12:00:00", "2026-06-11", "12:00:00", "G_SILENT", "Group Im Lặng", "U_D", "Thành viên D", "text", "Tin cũ", "", 1, "Webhook", ""
  ]);
  allSheetsData["Interaction_Logs"].push([
    new Date().toISOString(), todayDateStr, "12:00:00", "G_SILENT", "Group Im Lặng", "U_A", "Thành viên A", "text", "Tin mới", "", 1, "Webhook", ""
  ]);
  allSheetsData["Interaction_Logs"].push([
    new Date().toISOString(), todayDateStr, "12:05:00", "G_SILENT", "Group Im Lặng", "U_B", "Thành viên B", "text", "Tin mới", "", 1, "Webhook", ""
  ]);

  // Test 1: Một số thành viên chưa tương tác
  const report1 = mockSandbox.buildSilentMembersReport("G_SILENT", 1);
  console.log("SILENT REPORT OUTPUT (Some silent):\n", report1);
  assert.ok(report1.includes("⚠️ THÀNH VIÊN CHƯA TƯƠNG TÁC HÔM NAY"));
  assert.ok(report1.includes("Chưa tương tác: 2/4"));
  assert.ok(report1.includes("Thành viên C"));
  assert.ok(report1.includes("Thành viên D"));
  assert.ok(!report1.includes("Thành viên A"));
  assert.ok(!report1.includes("Thành viên B"));

  // Test 2: Tất cả thành viên đã tương tác (A, B, C, D đều tương tác hôm nay)
  allSheetsData["Interaction_Logs"].push([
    new Date().toISOString(), todayDateStr, "12:10:00", "G_SILENT", "Group Im Lặng", "U_C", "Thành viên C", "text", "Tin mới", "", 1, "Webhook", ""
  ]);
  allSheetsData["Interaction_Logs"].push([
    new Date().toISOString(), todayDateStr, "12:15:00", "G_SILENT", "Group Im Lặng", "U_D", "Thành viên D", "text", "Tin mới", "", 1, "Webhook", ""
  ]);
  const report2 = mockSandbox.buildSilentMembersReport("G_SILENT", 1);
  console.log("SILENT REPORT OUTPUT (All active):\n", report2);
  assert.ok(report2.includes("Chưa tương tác: 0/4"));
  assert.ok(report2.includes("🎉 Tuyệt vời! Tất cả thành viên đều đã tương tác."));

  // Test 3: Không có dữ liệu thành viên
  const report3 = mockSandbox.buildSilentMembersReport("G_NO_MEM", 1);
  console.log("SILENT REPORT OUTPUT (No data):\n", report3);
  assert.ok(report3.includes("Chưa tương tác: 0/0"));
  assert.ok(report3.includes("🎉 Tuyệt vời! Tất cả thành viên đều đã tương tác."));
});

runTest("Test lệnh im lặng trong chat riêng và chat nhóm", () => {
  replies.length = 0;
  
  // Test 4: Chat riêng trả hướng dẫn
  const eventPrivate = {
    replyToken: "token_priv",
    source: { userId: "U_A" }
  };
  const handledPriv = mockSandbox.handleTextCommand(eventPrivate, "/imlang", "U_A", null);
  assert.strictEqual(handledPriv, true);
  assert.strictEqual(replies.length, 1);
  assert.strictEqual(replies[0].text, "Lệnh này dùng trong nhóm.");

  // Test 5: Chat nhóm chạy lệnh /imlang
  replies.length = 0;
  const eventGroup = {
    replyToken: "token_group_imlang",
    source: { groupId: "G_SILENT", userId: "U_A" }
  };
  const handledGroup = mockSandbox.handleTextCommand(eventGroup, "/imlang", "U_A", "G_SILENT");
  assert.strictEqual(handledGroup, true);
  assert.strictEqual(replies.length, 1);
  assert.ok(replies[0].text.includes("⚠️ THÀNH VIÊN CHƯA TƯƠNG TÁC HÔM NAY"));

  // Test 6: Chat nhóm chạy lệnh /chuaonline
  replies.length = 0;
  const handledChuaOnline = mockSandbox.handleTextCommand(eventGroup, "/chuaonline", "U_A", "G_SILENT");
  assert.strictEqual(handledChuaOnline, true);
  assert.strictEqual(replies.length, 1);
  assert.ok(replies[0].text.includes("⚠️ THÀNH VIÊN CHƯA TƯƠNG TÁC HÔM NAY"));

  // Test 7: Chat nhóm chạy lệnh /imlang7ngay
  replies.length = 0;
  const handledGroup7 = mockSandbox.handleTextCommand(eventGroup, "/imlang7ngay", "U_A", "G_SILENT");
  assert.strictEqual(handledGroup7, true);
  assert.strictEqual(replies.length, 1);
  assert.ok(replies[0].text.includes("⚠️ THÀNH VIÊN CHƯA TƯƠNG TÁC 7 NGÀY QUA"));
});

runTest("Test thống kê hiệu suất công việc trong nhóm có dữ liệu", () => {
  const todayDateStr = new Date().toISOString().substring(0, 10);
  const tStart = new Date();
  tStart.setHours(tStart.getHours() - 4); // 4 hours ago
  
  const tResponse = new Date();
  tResponse.setHours(tResponse.getHours() - 1); // 1 hour ago
  
  // Set up Sự kiện sheet
  allSheetsData["Sự kiện"] = [
    ["Task ID", "Tên sự kiện", "Nội dung", "Ngày giờ gửi", "Link ảnh đính kèm", "Lặp lại", "Nhóm nhận", "Người phụ trách", "Tần suất (phút)", "Hình thức xác nhận", "Độ ưu tiên", "Người xác nhận", "Trạng thái", "Lần nhắc cuối", "Số lần nhắc", "Link Ảnh Nghiệm Thu", "Deadline", "Loại công việc", "Người giao việc", "Người theo dõi", "Ghi chú", "Trạng thái xử lý chi tiết", "Lịch sử cập nhật", "Đã nhắc trước deadline"],
    ["T-PERF-1", "Việc hoàn thành", "Nội dung 1", tStart.toISOString(), "", "", "G_PERF_1", "U_PERF_A", "", "", "", "", "Đã gửi", "", "0", "https://img.link/1.jpg", "", "", "", "", "", "", "", ""],
    ["T-PERF-2", "Việc quá hạn", "Nội dung 2", tStart.toISOString(), "", "", "G_PERF_1", "U_PERF_B", "", "", "", "", "Quá hạn", "", "2", "", "", "", "", "", "", "", "", ""],
    ["T-PERF-3", "Việc chưa xong", "Nội dung 3", tStart.toISOString(), "", "", "G_PERF_1", "U_PERF_C", "", "", "", "", "Đang làm", "", "0", "", "", "", "", "", "", "", "", ""],
    ["T-PERF-4", "Việc chung A và B", "Nội dung 4", tStart.toISOString(), "", "", "G_PERF_1", "U_PERF_A,U_PERF_B", "", "", "", "", "Đang làm", "", "1", "", "", "", "", "", "", "", "", ""]
  ];
  
  // Set up Task_Logs sheet
  allSheetsData["Task_Logs"] = [
    ["Thời gian", "Task ID", "Hành động", "Người thực hiện", "Nội dung cũ", "Nội dung mới", "Ghi chú"],
    [tStart.toISOString(), "T-PERF-1", "Tạo việc", "System", "", "", ""],
    [tResponse.toISOString(), "T-PERF-1", "Đổi trạng thái", "Thành viên A", "Chờ gửi ảnh", "Đang làm", "Bắt đầu làm"]
  ];
  
  const report = mockSandbox.buildTaskPerformanceReport("G_PERF_1", 1);
  console.log("PERFORMANCE REPORT OUTPUT:\n", report);
  
  assert.ok(report.includes("📌 HIỆU SUẤT CÔNG VIỆC HÔM NAY"));
  assert.ok(report.includes("Group: Nhóm Test LINE"));
  assert.ok(report.includes("Tổng việc: 4"));
  assert.ok(report.includes("Đã hoàn tất: 1"));
  assert.ok(report.includes("Chưa xong: 3"));
  assert.ok(report.includes("Quá hạn: 1"));
  assert.ok(report.includes("Tỷ lệ hoàn thành: 25%"));
  
  // Top completed list
  assert.ok(report.includes("U PERF A - 1/2 việc - 50%"));
  
  // Cần theo dõi
  assert.ok(report.includes("U PERF B - 1 việc quá hạn"));
  assert.ok(report.includes("U PERF A - phản hồi chậm trung bình 3 giờ"));
});

runTest("Test thống kê hiệu suất nhóm không có dữ liệu", () => {
  const report = mockSandbox.buildTaskPerformanceReport("G_NO_PERF", 1);
  console.log("EMPTY PERFORMANCE REPORT OUTPUT:\n", report);
  assert.ok(report.includes("Tổng việc: 0"));
  assert.ok(report.includes("Đã hoàn tất: 0"));
  assert.ok(report.includes("(Chưa có dữ liệu thành viên)"));
  assert.ok(report.includes("Không có nhân viên cần theo dõi."));
});

runTest("Test lệnh hiệu suất trong chat riêng và chat nhóm", () => {
  replies.length = 0;
  
  // Test 4: Chat riêng trả hướng dẫn
  const eventPrivate = {
    replyToken: "token_perf_priv",
    source: { userId: "U_PERF_A" }
  };
  const handledPriv = mockSandbox.handleTextCommand(eventPrivate, "/hieusuat", "U_PERF_A", null);
  assert.strictEqual(handledPriv, true);
  assert.strictEqual(replies.length, 1);
  assert.strictEqual(replies[0].text, "Lệnh này dùng trong nhóm.");

  // Test 5: Chat nhóm chạy lệnh /hieusuat
  replies.length = 0;
  const eventGroup = {
    replyToken: "token_group_hieusuat",
    source: { groupId: "G_PERF_1", userId: "U_PERF_A" }
  };
  const handledGroup = mockSandbox.handleTextCommand(eventGroup, "/hieusuat", "U_PERF_A", "G_PERF_1");
  assert.strictEqual(handledGroup, true);
  assert.strictEqual(replies.length, 1);
  assert.ok(replies[0].text.includes("📌 HIỆU SUẤT CÔNG VIỆC HÔM NAY"));

  // Test 6: Chat nhóm chạy lệnh /topviec
  replies.length = 0;
  const handledTopViec = mockSandbox.handleTextCommand(eventGroup, "/topviec", "U_PERF_A", "G_PERF_1");
  assert.strictEqual(handledTopViec, true);
  assert.strictEqual(replies.length, 1);
  assert.ok(replies[0].text.includes("📌 HIỆU SUẤT CÔNG VIỆC HÔM NAY"));

  // Test 7: Chat nhóm chạy lệnh /hieusuat7ngay
  replies.length = 0;
  const handledHieusuat7 = mockSandbox.handleTextCommand(eventGroup, "/hieusuat7ngay", "U_PERF_A", "G_PERF_1");
  assert.strictEqual(handledHieusuat7, true);
  assert.strictEqual(replies.length, 1);
  assert.ok(replies[0].text.includes("📌 HIỆU SUẤT CÔNG VIỆC 7 NGÀY QUA"));

  // Test 8: Chat nhóm chạy lệnh /chamviec
  replies.length = 0;
  const handledChamViec = mockSandbox.handleTextCommand(eventGroup, "/chamviec", "U_PERF_A", "G_PERF_1");
  assert.strictEqual(handledChamViec, true);
  assert.strictEqual(replies.length, 1);
  assert.ok(replies[0].text.includes("📌 HIỆU SUẤT CÔNG VIỆC 7 NGÀY QUA"));
});

runTest("Test phân tích khung giờ hoạt động của nhóm có dữ liệu", () => {
  const todayDateStr = new Date().toISOString().substring(0, 10);
  
  // Set up Interaction_Logs with hourly data
  // We want to test multiple hours (e.g. 8:00, 15:00) and only one hour, and no data
  allSheetsData["Interaction_Logs"] = [
    ["Thời gian", "Ngày", "Giờ", "Group ID", "Group Name", "User ID", "Tên Line", "Loại tương tác", "Nội dung rút gọn", "Task ID", "Điểm tương tác", "Nguồn", "Ghi chú"],
    [new Date().toISOString(), todayDateStr, "08:15:30", "G_HOUR_1", "Nhóm Khung Giờ", "U_A", "Thành viên A", "text", "Tin nhắn", "", 1, "Webhook", ""],
    [new Date().toISOString(), todayDateStr, "08:45:00", "G_HOUR_1", "Nhóm Khung Giờ", "U_B", "Thành viên B", "text", "Tin nhắn", "", 1, "Webhook", ""],
    [new Date().toISOString(), todayDateStr, "15:10:00", "G_HOUR_1", "Nhóm Khung Giờ", "U_A", "Thành viên A", "text", "Tin nhắn", "", 1, "Webhook", ""],
    [new Date().toISOString(), todayDateStr, "15:20:00", "G_HOUR_1", "Nhóm Khung Giờ", "U_B", "Thành viên B", "text", "Tin nhắn", "", 1, "Webhook", ""],
    [new Date().toISOString(), todayDateStr, "15:30:00", "G_HOUR_1", "Nhóm Khung Giờ", "U_C", "Thành viên C", "text", "Tin nhắn", "", 1, "Webhook", ""]
  ];
  
  // Test 1: Có dữ liệu nhiều giờ
  const report1 = mockSandbox.buildHourlyInteractionReport("G_HOUR_1", 1);
  console.log("HOURLY REPORT OUTPUT (multiple hours):\n", report1);
  assert.ok(report1.includes("🕒 KHUNG GIỜ TƯƠNG TÁC MẠNH"));
  assert.ok(report1.includes("08:00 - 09:00: 2 tương tác"));
  assert.ok(report1.includes("15:00 - 16:00: 3 tương tác"));
  assert.ok(report1.includes("🔥 Sôi động nhất: 15:00 - 16:00"));
  assert.ok(report1.includes("Nên gửi nhắc việc quan trọng trong khung 15:00 - 16:00."));

  // Test 2: Chỉ có dữ liệu một khung giờ
  allSheetsData["Interaction_Logs"] = [
    ["Thời gian", "Ngày", "Giờ", "Group ID", "Group Name", "User ID", "Tên Line", "Loại tương tác", "Nội dung rút gọn", "Task ID", "Điểm tương tác", "Nguồn", "Ghi chú"],
    [new Date().toISOString(), todayDateStr, "11:25:00", "G_HOUR_2", "Nhóm Một Giờ", "U_A", "Thành viên A", "text", "Tin nhắn", "", 1, "Webhook", ""]
  ];
  const report2 = mockSandbox.buildHourlyInteractionReport("G_HOUR_2", 1);
  console.log("HOURLY REPORT OUTPUT (single hour):\n", report2);
  assert.ok(report2.includes("11:00 - 12:00: 1 tương tác"));
  assert.ok(report2.includes("🔥 Sôi động nhất: 11:00 - 12:00"));

  // Test 3: Không có dữ liệu
  const report3 = mockSandbox.buildHourlyInteractionReport("G_NO_HOUR", 1);
  console.log("HOURLY REPORT OUTPUT (no data):\n", report3);
  assert.strictEqual(report3, "⚠️ Chưa có dữ liệu tương tác trong group này.");
});

runTest("Test các lệnh khung giờ trong chat riêng và chat nhóm", () => {
  replies.length = 0;
  
  // Test 4: Chat riêng trả hướng dẫn
  const eventPrivate = {
    replyToken: "token_hour_priv",
    source: { userId: "U_A" }
  };
  const handledPriv = mockSandbox.handleTextCommand(eventPrivate, "/khunggio", "U_A", null);
  assert.strictEqual(handledPriv, true);
  assert.strictEqual(replies.length, 1);
  assert.strictEqual(replies[0].text, "Lệnh này dùng trong nhóm.");

  // Test 5: Chat nhóm chạy lệnh /khunggio
  replies.length = 0;
  const eventGroup = {
    replyToken: "token_group_khunggio",
    source: { groupId: "G_HOUR_1", userId: "U_A" }
  };
  const handledGroup = mockSandbox.handleTextCommand(eventGroup, "/khunggio", "U_A", "G_HOUR_1");
  assert.strictEqual(handledGroup, true);
  assert.strictEqual(replies.length, 1);
  assert.ok(replies[0].text.includes("🕒 KHUNG GIỜ TƯƠNG TÁC MẠNH") || replies[0].text.includes("Chưa có dữ liệu"));

  // Test 6: Chat nhóm chạy lệnh /giohot
  replies.length = 0;
  const handledGioHot = mockSandbox.handleTextCommand(eventGroup, "/giohot", "U_A", "G_HOUR_1");
  assert.strictEqual(handledGioHot, true);
  assert.strictEqual(replies.length, 1);
  assert.ok(replies[0].text.includes("🕒 KHUNG GIỜ TƯƠNG TÁC MẠNH") || replies[0].text.includes("Chưa có dữ liệu"));

  // Test 7: Chat nhóm chạy lệnh /khunggio7ngay
  replies.length = 0;
  const handledGroup7 = mockSandbox.handleTextCommand(eventGroup, "/khunggio7ngay", "U_A", "G_HOUR_1");
  assert.strictEqual(handledGroup7, true);
  assert.strictEqual(replies.length, 1);
  assert.ok(replies[0].text.includes("🕒 KHUNG GIỜ TƯƠNG TÁC MẠNH") || replies[0].text.includes("Chưa có dữ liệu"));
});

runTest("Test cảnh báo group im lặng - Lệnh bật/tắt/cấu hình/trạng thái", () => {
  replies.length = 0;
  allSheetsData["Group_Settings"] = [
    ["Group ID", "Group Name", "Bật cảnh báo im lặng", "Số phút im lặng", "Giờ bắt đầu theo dõi", "Giờ kết thúc theo dõi", "Lần cảnh báo cuối", "Trạng thái"]
  ];

  const eventGroup = {
    replyToken: "token_silent_group",
    source: { groupId: "G_SILENT_1", userId: "U_A" }
  };

  // 1. Test lệnh /trangthaiimlang khi chưa có cấu hình (phải tạo cấu hình mặc định)
  const handledStatus = mockSandbox.handleTextCommand(eventGroup, "/trangthaiimlang", "U_A", "G_SILENT_1");
  assert.strictEqual(handledStatus, true);
  assert.strictEqual(replies.length, 1);
  assert.ok(replies[0].text.includes("Bật cảnh báo: Không"));
  assert.ok(replies[0].text.includes("Số phút im lặng: 90"));
  assert.ok(replies[0].text.includes("Khung giờ theo dõi: 08:00 - 21:00"));

  // 2. Test lệnh /batimlang
  replies.length = 0;
  const handledBat = mockSandbox.handleTextCommand(eventGroup, "/batimlang", "U_A", "G_SILENT_1");
  assert.strictEqual(handledBat, true);
  assert.strictEqual(replies.length, 1);
  assert.ok(replies[0].text.includes("Đã BẬT cảnh báo im lặng"));
  
  var setting = mockSandbox.getGroupSettings("G_SILENT_1");
  assert.strictEqual(setting["Bật cảnh báo im lặng"], "Có");

  // 3. Test lệnh /tatimlang
  replies.length = 0;
  const handledTat = mockSandbox.handleTextCommand(eventGroup, "/tatimlang", "U_A", "G_SILENT_1");
  assert.strictEqual(handledTat, true);
  assert.strictEqual(replies.length, 1);
  assert.ok(replies[0].text.includes("Đã TẮT cảnh báo im lặng"));
  
  setting = mockSandbox.getGroupSettings("G_SILENT_1");
  assert.strictEqual(setting["Bật cảnh báo im lặng"], "Không");

  // 4. Test lệnh /caidatimlang 60
  replies.length = 0;
  const handledCai60 = mockSandbox.handleTextCommand(eventGroup, "/caidatimlang 60", "U_A", "G_SILENT_1");
  assert.strictEqual(handledCai60, true);
  assert.strictEqual(replies.length, 1);
  assert.ok(replies[0].text.includes("thời gian cảnh báo im lặng thành 60 phút"));
  
  setting = mockSandbox.getGroupSettings("G_SILENT_1");
  assert.strictEqual(setting["Số phút im lặng"], 60);

  // 5. Test lệnh /caidatimlang 120
  replies.length = 0;
  const handledCai120 = mockSandbox.handleTextCommand(eventGroup, "/caidatimlang 120", "U_A", "G_SILENT_1");
  assert.strictEqual(handledCai120, true);
  assert.strictEqual(replies.length, 1);
  assert.ok(replies[0].text.includes("thời gian cảnh báo im lặng thành 120 phút"));
  
  setting = mockSandbox.getGroupSettings("G_SILENT_1");
  assert.strictEqual(setting["Số phút im lặng"], 120);
});

runTest("Test logic cảnh báo im lặng (checkSilentGroups & shouldAlert)", () => {
  allSheetsData["Interaction_Logs"] = [
    ["Thời gian", "Ngày", "Giờ", "Group ID", "Group Name", "User ID", "Tên Line", "Loại tương tác", "Nội dung rút gọn", "Task ID", "Điểm tương tác", "Nguồn", "Ghi chú"]
  ];
  allSheetsData["Group_Settings"] = [
    ["Group ID", "Group Name", "Bật cảnh báo im lặng", "Số phút im lặng", "Giờ bắt đầu theo dõi", "Giờ kết thúc theo dõi", "Lần cảnh báo cuối", "Trạng thái"]
  ];

  // 1. Thiết lập nhóm G_ALERT với cảnh báo bật, im lặng 90 phút, giờ hành chính 08:00 - 21:00
  // Đưa một log tương tác vào 100 phút trước
  const now = new Date();
  const tLastInteraction = new Date(now.getTime() - 100 * 60 * 1000);
  const tLastInteractionStr = tLastInteraction.toISOString();
  
  allSheetsData["Interaction_Logs"].push([
    tLastInteractionStr, "2026-06-12", "12:00:00", "G_ALERT", "Group Alert", "U_A", "User A", "text", "test msg", "", 1, "Webhook", ""
  ]);

  allSheetsData["Group_Settings"].push([
    "G_ALERT", "Group Alert", "Có", 90, "08:00", "21:00", "", "Bình thường"
  ]);

  // Giả lập thời gian trong giờ làm việc bao phủ giờ hiện tại
  mockSandbox.updateGroupSettingField("G_ALERT", "Giờ bắt đầu theo dõi", "00:00");
  mockSandbox.updateGroupSettingField("G_ALERT", "Giờ kết thúc theo dõi", "23:59");

  // Kiểm tra: shouldAlertSilentGroup phải trả về true
  const sNew = mockSandbox.getGroupSettings("G_ALERT");
  const alertOk = mockSandbox.shouldAlertSilentGroup(sNew);
  assert.strictEqual(alertOk, true);

  // 2. Test ngoài giờ làm việc: set Giờ bắt đầu và kết thúc không bao gồm giờ hiện tại
  mockSandbox.updateGroupSettingField("G_ALERT", "Giờ bắt đầu theo dõi", "01:00");
  mockSandbox.updateGroupSettingField("G_ALERT", "Giờ kết thúc theo dõi", "02:00");
  
  const sOutOfWork = mockSandbox.getGroupSettings("G_ALERT");
  const alertFailHours = mockSandbox.shouldAlertSilentGroup(sOutOfWork);
  assert.strictEqual(alertFailHours, false);

  // Khôi phục lại giờ hoạt động bao phủ để test tiếp
  mockSandbox.updateGroupSettingField("G_ALERT", "Giờ bắt đầu theo dõi", "00:00");
  mockSandbox.updateGroupSettingField("G_ALERT", "Giờ kết thúc theo dõi", "23:59");

  // 3. Test cooldown: nếu đã cảnh báo cách đây 10 phút, thì shouldAlertSilentGroup trả về false
  const alertLastTime = new Date(now.getTime() - 10 * 60 * 1000).toISOString();
  mockSandbox.updateGroupSettingField("G_ALERT", "Lần cảnh báo cuối", alertLastTime);
  
  const sCooldown = mockSandbox.getGroupSettings("G_ALERT");
  const alertFailCooldown = mockSandbox.shouldAlertSilentGroup(sCooldown);
  assert.strictEqual(alertFailCooldown, false);

  // 4. Test sau khi cooldown hết (cảnh báo cuối cách đây 95 phút)
  const alertLastTimeOld = new Date(now.getTime() - 95 * 60 * 1000).toISOString();
  mockSandbox.updateGroupSettingField("G_ALERT", "Lần cảnh báo cuối", alertLastTimeOld);
  
  const sCooldownOver = mockSandbox.getGroupSettings("G_ALERT");
  const alertOkCooldownOver = mockSandbox.shouldAlertSilentGroup(sCooldownOver);
  assert.strictEqual(alertOkCooldownOver, true);

  // 5. Test checkSilentGroups thực sự push message tới admin
  replies.length = 0;
  mockSandbox.checkSilentGroups();
  assert.strictEqual(replies.length, 2);
  assert.ok(replies[0].text.includes("⚠️ GROUP ĐANG IM LẶNG"));
  assert.strictEqual(replies[0].replyToken, "U40778c187ce6a4e3ff38f5f00e998799");
  assert.strictEqual(replies[1].replyToken, "Ue6adbc54620f4c9c22e4c2755e09f5ff");

  // 6. Test tự động reset trạng thái về Bình thường khi có tương tác mới
  mockSandbox.updateGroupSettingField("G_ALERT", "Trạng thái", "Cảnh báo");
  mockSandbox.logInteraction({
    groupId: "G_ALERT",
    groupName: "Group Alert",
    userId: "U_A",
    userName: "User A",
    type: "text",
    content: "Tương tác mới cứu nhóm im lặng",
    time: new Date()
  });

  const sAfterInteraction = mockSandbox.getGroupSettings("G_ALERT");
  assert.strictEqual(sAfterInteraction["Trạng thái"], "Bình thường");
});

// ----------------------------------------------------
// PHẦN K: TEST BÁO CÁO TƯƠNG TÁC CUỐI NGÀY TỰ ĐỘNG
// ----------------------------------------------------
console.log("\n--- PHẦN K: BÁO CÁO TƯƠNG TÁC CUỐI NGÀY TỰ ĐỘNG ---");

runTest("Test báo cáo cuối ngày - Lệnh bật/tắt/xem báo cáo/phân quyền gửi", () => {
  replies.length = 0;
  allSheetsData["Group_Settings"] = [
    ["Group ID", "Group Name", "Bật cảnh báo im lặng", "Số phút im lặng", "Giờ bắt đầu theo dõi", "Giờ kết thúc theo dõi", "Lần cảnh báo cuối", "Trạng thái", "Bật báo cáo cuối ngày", "Giờ gửi báo cáo", "Lần gửi báo cáo cuối"]
  ];

  const eventGroup = {
    replyToken: "token_report_group",
    source: { groupId: "G_REPORT_1", userId: "U222" }
  };

  // 1. Test lệnh /batbaocao
  const handledBat = mockSandbox.handleTextCommand(eventGroup, "/batbaocao", "U222", "G_REPORT_1");
  assert.strictEqual(handledBat, true);
  assert.strictEqual(replies.length, 1);
  assert.ok(replies[0].text.includes("Đã BẬT báo cáo tương tác cuối ngày"));
  
  var setting = mockSandbox.getGroupSettings("G_REPORT_1");
  assert.strictEqual(setting["Bật báo cáo cuối ngày"], "Có");

  // 2. Test lệnh /tatbaocao
  replies.length = 0;
  const handledTat = mockSandbox.handleTextCommand(eventGroup, "/tatbaocao", "U222", "G_REPORT_1");
  assert.strictEqual(handledTat, true);
  assert.strictEqual(replies.length, 1);
  assert.ok(replies[0].text.includes("Đã TẮT báo cáo tương tác cuối ngày"));
  
  setting = mockSandbox.getGroupSettings("G_REPORT_1");
  assert.strictEqual(setting["Bật báo cáo cuối ngày"], "Không");

  // Khôi phục bật để test xem báo cáo
  mockSandbox.updateGroupSettingField("G_REPORT_1", "Bật báo cáo cuối ngày", "Có");

  // 3. Test lệnh /baocaongay (xem báo cáo hôm nay lập tức, mọi user đều gọi được)
  replies.length = 0;
  const handledXem = mockSandbox.handleTextCommand(eventGroup, "/baocaongay", "U222", "G_REPORT_1");
  assert.strictEqual(handledXem, true);
  assert.strictEqual(replies.length, 1);
  assert.ok(replies[0].text.includes("📊 BÁO CÁO TƯƠNG TÁC CUỐI NGÀY"));
  assert.ok(replies[0].text.includes("Tổng tương tác:"));
  assert.ok(replies[0].text.includes("Thành viên hoạt động:"));
  assert.ok(replies[0].text.includes("Việc hoàn tất:"));
  assert.ok(replies[0].text.includes("🏆 Top tương tác:"));
  assert.ok(replies[0].text.includes("⚠️ Cần theo dõi:"));

  // 4. Test lệnh /guibaocao (gửi ngay lập tức - chỉ Admin/QL)
  // 4a. User thường (U222 - Nhân viên) gọi: báo lỗi
  replies.length = 0;
  const handledGuiFail = mockSandbox.handleTextCommand(eventGroup, "/guibaocao", "U222", "G_REPORT_1");
  assert.strictEqual(handledGuiFail, true);
  assert.strictEqual(replies.length, 1);
  assert.ok(replies[0].text.includes("Bạn không có quyền sử dụng lệnh này"));

  // 4b. Quản lý (U_QuanLy) gọi: thành công gửi báo cáo push và phản hồi xác nhận
  replies.length = 0;
  const handledGuiOk = mockSandbox.handleTextCommand(eventGroup, "/guibaocao", "U_QuanLy", "G_REPORT_1");
  assert.strictEqual(handledGuiOk, true);
  // Có 2 tin nhắn: 1 tin push báo cáo và 1 tin reply xác nhận thành công
  assert.strictEqual(replies.length, 2);
  assert.ok(replies[0].text.includes("📊 BÁO CÁO TƯƠNG TÁC CUỐI NGÀY"));
  assert.ok(replies[1].text.includes("Đã gửi báo cáo tương tác cuối ngày"));

  // Đảm bảo cập nhật lần gửi báo cáo cuối thành ngày hôm nay
  const tz = mockSandbox.Session.getScriptTimeZone();
  const todayStr = mockSandbox.Utilities.formatDate(new Date(), tz, "yyyy-MM-dd");
  setting = mockSandbox.getGroupSettings("G_REPORT_1");
  assert.strictEqual(setting["Lần gửi báo cáo cuối"], todayStr);
});

runTest("Test logic gửi báo cáo tự động (chặn gửi trùng & nhiều group)", () => {
  replies.length = 0;
  allSheetsData["Group_Settings"] = [
    ["Group ID", "Group Name", "Bật cảnh báo im lặng", "Số phút im lặng", "Giờ bắt đầu theo dõi", "Giờ kết thúc theo dõi", "Lần cảnh báo cuối", "Trạng thái", "Bật báo cáo cuối ngày", "Giờ gửi báo cáo", "Lần gửi báo cáo cuối"]
  ];

  const tz = mockSandbox.Session.getScriptTimeZone();
  const todayStr = mockSandbox.Utilities.formatDate(new Date(), tz, "yyyy-MM-dd");

  // Thiết lập 2 nhóm G_AUTO_A và G_AUTO_B cùng bật báo cáo cuối ngày lúc 17:30
  // Giả sử hiện tại đang là 18:00 (vượt quá 17:30)
  // Nhóm A chưa gửi báo cáo hôm nay (Lần gửi báo cáo cuối = "")
  // Nhóm B đã gửi báo cáo hôm nay rồi (Lần gửi báo cáo cuối = todayStr)
  allSheetsData["Group_Settings"].push([
    "G_AUTO_A", "Nhóm Auto A", "Không", 90, "08:00", "21:00", "", "Bình thường", "Có", "00:00", ""
  ]);
  allSheetsData["Group_Settings"].push([
    "G_AUTO_B", "Nhóm Auto B", "Không", 90, "08:00", "21:00", "", "Bình thường", "Có", "00:00", todayStr
  ]);

  // Chạy quét tự động gửi báo cáo
  mockSandbox.checkAndSendDailyInteractionReports();

  // Xác nhận chỉ có Nhóm A nhận được báo cáo tương tác, Nhóm B bị chặn (không gửi trùng)
  assert.strictEqual(replies.length, 1);
  assert.ok(replies[0].text.includes("📊 BÁO CÁO TƯƠNG TÁC CUỐI NGÀY"));
  assert.strictEqual(replies[0].replyToken, "G_AUTO_A");

  // Kiểm tra Nhóm A đã được cập nhật ngày gửi báo cáo cuối
  const settingA = mockSandbox.getGroupSettings("G_AUTO_A");
  assert.strictEqual(settingA["Lần gửi báo cáo cuối"], todayStr);
});

// ----------------------------------------------------
// PHẦN L: TEST GROUP HEALTH SCORE
// ----------------------------------------------------
console.log("\n--- PHẦN L: GROUP HEALTH SCORE ---");

runTest("Test Group Health Score - Group hoạt động tốt", () => {
  // Setup Group G_HEALTH_GOOD
  allSheetsData["Interaction_Logs"] = [
    ["Thời gian", "Ngày", "Giờ", "Group ID", "Group Name", "User ID", "Tên Line", "Loại tương tác", "Nội dung rút gọn", "Task ID", "Điểm tương tác", "Nguồn", "Ghi chú"]
  ];
  allSheetsData["Sự kiện"] = [
    ["Tên sự kiện", "Nội dung", "Ngày giờ gửi", "Link ảnh đính kèm", "Lặp lại", "Nhóm nhận", "Người phụ trách", "Tần suất (phút)", "Hình thức xác nhận", "Độ ưu tiên", "Người xác nhận", "Trạng thái", "Lần nhắc cuối", "Số lần nhắc", "Link Ảnh Nghiệm Thu", "Deadline", "Loại công việc", "Người giao việc", "Người theo dõi", "Ghi chú", "Trạng thái xử lý chi tiết", "Lịch sử cập nhật", "Đã nhắc trước deadline"]
  ];

  const tz = mockSandbox.Session.getScriptTimeZone();
  const timeStr = mockSandbox.Utilities.formatDate(new Date(), tz, "yyyy-MM-dd HH:mm:ss");
  const dateStr = mockSandbox.Utilities.formatDate(new Date(), tz, "yyyy-MM-dd");

  // Tương tác: 2 user active
  allSheetsData["Interaction_Logs"].push([
    timeStr, dateStr, timeStr, "G_HEALTH_GOOD", "Nhóm Tốt", "U1", "Thành viên Một", "text", "Tin 1", "", 1, "Webhook", ""
  ]);
  allSheetsData["Interaction_Logs"].push([
    timeStr, dateStr, timeStr, "G_HEALTH_GOOD", "Nhóm Tốt", "U2", "Thành viên Hai", "text", "Tin 2", "", 1, "Webhook", ""
  ]);

  // Công việc: 2 việc, hoàn thành 2
  allSheetsData["Sự kiện"].push([
    "Viec 1", "Noi dung", timeStr, "", "Không", "G_HEALTH_GOOD", "U1", 0, "Ảnh", "Trung bình", "", "Đã gửi", "", 0, "", "", "Công việc", "Admin", "", "", "", "", ""
  ]);
  allSheetsData["Sự kiện"].push([
    "Viec 2", "Noi dung", timeStr, "", "Không", "G_HEALTH_GOOD", "U2", 0, "Ảnh", "Trung bình", "", "Đã gửi", "", 0, "", "", "Công việc", "Admin", "", "", "", "", ""
  ]);

  const report = mockSandbox.buildGroupHealthReport("G_HEALTH_GOOD", 1);
  console.log("HEALTH REPORT (GOOD):", report);
  
  assert.ok(report.includes("SỨC KHỎE GROUP"));
  assert.ok(report.includes("RẤT TỐT") || report.includes("ỔN"));
  assert.ok(report.includes("Active: 40/40"));
  assert.ok(report.includes("Hoàn thành việc: 40/40"));
  assert.ok(report.includes("Điểm phạt: -0"));
});

runTest("Test Group Health Score - Group ít tương tác & có việc quá hạn", () => {
  // Setup Group G_HEALTH_BAD
  const tz = mockSandbox.Session.getScriptTimeZone();
  const timeStr = mockSandbox.Utilities.formatDate(new Date(), tz, "yyyy-MM-dd HH:mm:ss");
  const dateStr = mockSandbox.Utilities.formatDate(new Date(), tz, "yyyy-MM-dd");

  // Không có tương tác nào phát sinh
  // Công việc: 2 việc quá hạn
  allSheetsData["Sự kiện"].push([
    "Viec trê", "Noi dung", timeStr, "", "Không", "G_HEALTH_BAD", "U1", 0, "Ảnh", "Trung bình", "", "Quá hạn", "", 0, "", "", "Công việc", "Admin", "", "", "", "", ""
  ]);
  allSheetsData["Sự kiện"].push([
    "Viec trê 2", "Noi dung", timeStr, "", "Không", "G_HEALTH_BAD", "U2", 0, "Ảnh", "Trung bình", "", "Quá hạn", "", 0, "", "", "Công việc", "Admin", "", "", "", "", ""
  ]);

  const report = mockSandbox.buildGroupHealthReport("G_HEALTH_BAD", 1);
  console.log("HEALTH REPORT (BAD):", report);

  assert.ok(report.includes("SỨC KHỎE GROUP"));
  assert.ok(report.includes("CẦN CAN THIỆP") || report.includes("CẦN THEO DÕI"));
  // Có việc quá hạn trễ hạn nên điểm phạt sẽ lớn
  assert.ok(report.includes("Điểm phạt: -"));
  assert.ok(report.includes("việc quá hạn chưa xử lý"));
});

runTest("Test Group Health Score - Group trống không có dữ liệu", () => {
  const report = mockSandbox.buildGroupHealthReport("G_HEALTH_EMPTY", 1);
  console.log("HEALTH REPORT (EMPTY):", report);

  assert.ok(report.includes("SỨC KHỎE GROUP"));
  assert.ok(report.includes("Điểm phạt: -0"));
});

runTest("Test Group Health Score - Lệnh bot trong nhóm", () => {
  replies.length = 0;
  const eventGroup = {
    replyToken: "token_health_group",
    source: { groupId: "G_HEALTH_GOOD", userId: "U222" }
  };

  const handled = mockSandbox.handleTextCommand(eventGroup, "/suckhoe 7", "U222", "G_HEALTH_GOOD");
  assert.strictEqual(handled, true);
  assert.strictEqual(replies.length, 1);
  assert.ok(replies[0].text.includes("SỨC KHỎE GROUP (7 ngày qua)"));
});

// ----------------------------------------------------
// PHẦN M: TEST GOOGLE SHEET INTERACTION DASHBOARD
// ----------------------------------------------------
console.log("\n--- PHẦN M: GOOGLE SHEET INTERACTION DASHBOARD ---");

runTest("Test khởi tạo Dashboard Tương Tác", () => {
  mockSandbox.SETUP_DASHBOARD_TUONG_TAC();
  
  // Xác nhận sheet Dashboard_TuongTac được khởi tạo
  const sheet = mockSandbox.getSpreadsheet().getSheetByName("Dashboard_TuongTac");
  assert.ok(sheet);
  
  // Check banner
  const bannerText = sheet.getRange("A1").getValue();
  assert.strictEqual(bannerText, "📊 DASHBOARD THỐNG KÊ TƯƠNG TÁC & HIỆU SUẤT ĐỘI NHÓM");
  
  // Check bộ lọc mặc định
  assert.strictEqual(sheet.getRange("B4").getValue(), "Tất cả");
  assert.strictEqual(sheet.getRange("C4").getValue(), "Hôm nay");
});

runTest("Test cập nhật Dashboard với dữ liệu thực tế và lọc theo group/phạm vi ngày", () => {
  const ss = mockSandbox.getSpreadsheet();
  const sheet = ss.getSheetByName("Dashboard_TuongTac");
  
  allSheetsData["Interaction_Logs"] = [
    ["Thời gian", "Ngày", "Giờ", "Group ID", "Group Name", "User ID", "Tên Line", "Loại tương tác", "Nội dung rút gọn", "Task ID", "Điểm tương tác", "Nguồn", "Ghi chú"]
  ];
  allSheetsData["Sự kiện"] = [
    ["Tên sự kiện", "Nội dung", "Ngày giờ gửi", "Link ảnh đính kèm", "Lặp lại", "Nhóm nhận", "Người phụ trách", "Tần suất (phút)", "Hình thức xác nhận", "Độ ưu tiên", "Người xác nhận", "Trạng thái", "Lần nhắc cuối", "Số lần nhắc", "Link Ảnh Nghiệm Thu", "Deadline", "Loại công việc", "Người giao việc", "Người theo dõi", "Ghi chú", "Trạng thái xử lý chi tiết", "Lịch sử cập nhật", "Đã nhắc trước deadline"]
  ];
  allSheetsData["ID_Member"] = [
    ["Tên Line", "ID Line"],
    ["Thành viên Một", "U00000000000000000000000000000001"],
    ["Thành viên Hai", "U00000000000000000000000000000002"]
  ];

  const tz = mockSandbox.Session.getScriptTimeZone();
  const timeStr = mockSandbox.Utilities.formatDate(new Date(), tz, "yyyy-MM-dd HH:mm:ss");
  const dateStr = mockSandbox.Utilities.formatDate(new Date(), tz, "yyyy-MM-dd");

  // Add interactions
  // U00000000000000000000000000000001 tương tác trong group G_D1
  allSheetsData["Interaction_Logs"].push([
    timeStr, dateStr, timeStr, "G_D1", "Group Dash 1", "U00000000000000000000000000000001", "Thành viên Một", "text", "Tin nhan", "", 1, "Webhook", ""
  ]);
  // U00000000000000000000000000000002 tương tác trong group G_D2
  allSheetsData["Interaction_Logs"].push([
    timeStr, dateStr, timeStr, "G_D2", "Group Dash 2", "U00000000000000000000000000000002", "Thành viên Hai", "text", "Tin nhan", "", 1, "Webhook", ""
  ]);

  // Add tasks
  allSheetsData["Sự kiện"].push([
    "Viec 1", "Noi dung", timeStr, "", "Không", "G_D1", "U00000000000000000000000000000001", 0, "Ảnh", "Trung bình", "", "Đã gửi", "", 0, "", "", "Công việc", "Admin", "", "", "", "", ""
  ]);

  // 1. Test "Tất cả" group
  sheet.getRange("B4").setValue("Tất cả");
  sheet.getRange("C4").setValue("Hôm nay");
  mockSandbox.UPDATE_DASHBOARD_TUONG_TAC();
  
  // KPI values Row 7:
  // A7: Tổng tương tác (2)
  // B7: Active count (2/2)
  // E7: Việc hoàn tất (1/1)
  assert.strictEqual(sheet.getRange("A7").getValue(), 2);
  assert.strictEqual(sheet.getRange("B7").getValue(), "2/2");
  assert.strictEqual(sheet.getRange("E7").getValue(), "1/1");
  assert.strictEqual(sheet.getRange("F7").getValue(), 0); // 0 việc quá hạn
  
  // Test Top 10 row value
  // Top tương tác column A, B: Thành viên Một và Hai
  const topUser1 = sheet.getRange("A11").getValue();
  assert.ok(topUser1 === "Thành viên Một" || topUser1 === "Thành viên Hai");

  // 2. Test lọc riêng group G_D1
  sheet.getRange("B4").setValue("G_D1");
  mockSandbox.UPDATE_DASHBOARD_TUONG_TAC();

  // KPI values G_D1:
  // A7: Tổng tương tác (1)
  // E7: Việc hoàn tất (1/1)
  assert.strictEqual(sheet.getRange("A7").getValue(), 1);
  assert.strictEqual(sheet.getRange("E7").getValue(), "1/1");
});

runTest("Test Dashboard không bị lỗi khi chưa có dữ liệu", () => {
  const ss = mockSandbox.getSpreadsheet();
  const sheet = ss.getSheetByName("Dashboard_TuongTac");
  
  allSheetsData["Interaction_Logs"] = [
    ["Thời gian", "Ngày", "Giờ", "Group ID", "Group Name", "User ID", "Tên Line", "Loại tương tác", "Nội dung rút gọn", "Task ID", "Điểm tương tác", "Nguồn", "Ghi chú"]
  ];
  allSheetsData["Sự kiện"] = [
    ["Tên sự kiện", "Nội dung", "Ngày giờ gửi", "Link ảnh đính kèm", "Lặp lại", "Nhóm nhận", "Người phụ trách", "Tần suất (phút)", "Hình thức xác nhận", "Độ ưu tiên", "Người xác nhận", "Trạng thái", "Lần nhắc cuối", "Số lần nhắc", "Link Ảnh Nghiệm Thu", "Deadline", "Loại công việc", "Người giao việc", "Người theo dõi", "Ghi chú", "Trạng thái xử lý chi tiết", "Lịch sử cập nhật", "Đã nhắc trước deadline"]
  ];
  
  sheet.getRange("B4").setValue("G_D1");
  sheet.getRange("C4").setValue("Hôm nay");
  
  // Chạy cập nhật không có dữ liệu, đảm bảo không quăng lỗi
  mockSandbox.UPDATE_DASHBOARD_TUONG_TAC();
  
  assert.strictEqual(sheet.getRange("A7").getValue(), 0);
  assert.strictEqual(sheet.getRange("F7").getValue(), 0);
});

// ----------------------------------------------------
// PHẦN N: TEST CẢNH BÁO BẤT THƯỜNG (ANOMALY DETECTION)
// ----------------------------------------------------
console.log("\n--- PHẦN N: CẢNH BÁO BẤT THƯỜNG (ANOMALY DETECTION) ---");

runTest("Test cảnh báo bất thường - Group bình thường", () => {
  allSheetsData["Group_Settings"] = [
    ["Group ID", "Group Name", "Bật cảnh báo im lặng", "Số phút im lặng", "Giờ bắt đầu theo dõi", "Giờ kết thúc theo dõi", "Lần cảnh báo cuối", "Trạng thái", "Bật báo cáo cuối ngày", "Giờ gửi báo cáo", "Lần gửi báo cáo cuối", "Bật cảnh báo bất thường", "Ngưỡng giảm tương tác (%)", "Ngưỡng việc quá hạn", "Lần cảnh báo bất thường cuối"],
    ["G_ANOM_NORMAL", "Nhóm Bình Thường", "Không", 90, 8, 18, "", "Đang hoạt động", "Không", "", "", "Không", 30, 2, ""]
  ];
  allSheetsData["Interaction_Logs"] = [
    ["Thời gian", "Ngày", "Giờ", "Group ID", "Group Name", "User ID", "Tên Line", "Loại tương tác", "Nội dung rút gọn", "Task ID", "Điểm tương tác", "Nguồn", "Ghi chú"]
  ];
  allSheetsData["Sự kiện"] = [
    ["Tên sự kiện", "Nội dung", "Ngày giờ gửi", "Link ảnh đính kèm", "Lặp lại", "Nhóm nhận", "Người phụ trách", "Tần suất (phút)", "Hình thức xác nhận", "Độ ưu tiên", "Người xác nhận", "Trạng thái", "Lần nhắc cuối", "Số lần nhắc", "Link Ảnh Nghiệm Thu", "Deadline", "Loại công việc", "Người giao việc", "Người theo dõi", "Ghi chú", "Trạng thái xử lý chi tiết", "Lịch sử cập nhật", "Đã nhắc trước deadline"]
  ];

  const report = mockSandbox.buildAnomalyReport("G_ANOM_NORMAL");
  assert.ok(report.includes("Không phát hiện bất thường"));
});

runTest("Test cảnh báo bất thường - Group giảm tương tác", () => {
  allSheetsData["Group_Settings"] = [
    ["Group ID", "Group Name", "Bật cảnh báo im lặng", "Số phút im lặng", "Giờ bắt đầu theo dõi", "Giờ kết thúc theo dõi", "Lần cảnh báo cuối", "Trạng thái", "Bật báo cáo cuối ngày", "Giờ gửi báo cáo", "Lần gửi báo cáo cuối", "Bật cảnh báo bất thường", "Ngưỡng giảm tương tác (%)", "Ngưỡng việc quá hạn", "Lần cảnh báo bất thường cuối"],
    ["G_ANOM_DROP", "Nhóm Giảm Tương Tác", "Không", 90, 8, 18, "", "Đang hoạt động", "Không", "", "", "Có", 30, 2, ""]
  ];
  
  allSheetsData["Interaction_Logs"] = [
    ["Thời gian", "Ngày", "Giờ", "Group ID", "Group Name", "User ID", "Tên Line", "Loại tương tác", "Nội dung rút gọn", "Task ID", "Điểm tương tác", "Nguồn", "Ghi chú"]
  ];
  
  const tz = mockSandbox.Session.getScriptTimeZone();
  const timeToday = new Date();
  const timeTodayStr = mockSandbox.Utilities.formatDate(timeToday, tz, "yyyy-MM-dd HH:mm:ss");

  // Ghi nhận tương tác trong 7 ngày trước: 10 tương tác mỗi ngày
  for (let d = 1; d <= 7; d++) {
    const timeHist = new Date(timeToday.getTime() - d * 24 * 3600 * 1000);
    const timeHistStr = mockSandbox.Utilities.formatDate(timeHist, tz, "yyyy-MM-dd HH:mm:ss");
    const dateHistStr = mockSandbox.Utilities.formatDate(timeHist, tz, "yyyy-MM-dd");
    for (let i = 0; i < 10; i++) {
      allSheetsData["Interaction_Logs"].push([
        timeHistStr, dateHistStr, timeHistStr, "G_ANOM_DROP", "Nhóm Giảm Tương Tác", "U_ANOM_ACTIVE", "Active Member", "text", "test", "", 1, "Webhook", ""
      ]);
    }
  }

  // Hôm nay chỉ có 1 tương tác (giảm 90% > 30% ngưỡng)
  allSheetsData["Interaction_Logs"].push([
    timeTodayStr, timeTodayStr.split(" ")[0], timeTodayStr, "G_ANOM_DROP", "Nhóm Giảm Tương Tác", "U_ANOM_ACTIVE", "Active Member", "text", "test", "", 1, "Webhook", ""
  ]);

  const anomalies = mockSandbox.detectInteractionAnomalies("G_ANOM_DROP");
  assert.ok(anomalies.some(a => a.includes("giảm tương tác")));
});

runTest("Test cảnh báo bất thường - Nhiều việc quá hạn & nhắc quá 3 lần", () => {
  allSheetsData["Group_Settings"] = [
    ["Group ID", "Group Name", "Bật cảnh báo im lặng", "Số phút im lặng", "Giờ bắt đầu theo dõi", "Giờ kết thúc theo dõi", "Lần cảnh báo cuối", "Trạng thái", "Bật báo cáo cuối ngày", "Giờ gửi báo cáo", "Lần gửi báo cáo cuối", "Bật cảnh báo bất thường", "Ngưỡng giảm tương tác (%)", "Ngưỡng việc quá hạn", "Lần cảnh báo bất thường cuối"],
    ["G_ANOM_TASK", "Nhóm Quá Hạn", "Không", 90, 8, 18, "", "Đang hoạt động", "Không", "", "", "Có", 30, 2, ""]
  ];
  allSheetsData["Sự kiện"] = [
    ["Tên sự kiện", "Nội dung", "Ngày giờ gửi", "Link ảnh đính kèm", "Lặp lại", "Nhóm nhận", "Người phụ trách", "Tần suất (phút)", "Hình thức xác nhận", "Độ ưu tiên", "Người xác nhận", "Trạng thái", "Lần nhắc cuối", "Số lần nhắc", "Link Ảnh Nghiệm Thu", "Deadline", "Loại công việc", "Người giao việc", "Người theo dõi", "Ghi chú", "Trạng thái xử lý chi tiết", "Lịch sử cập nhật", "Đã nhắc trước deadline"],
    // Việc 1: Quá hạn
    ["Viec 1", "Noi dung", "2026-06-12 10:00:00", "", "Không", "G_ANOM_TASK", "U_ANOM_A", 0, "Ảnh", "Trung bình", "", "Quá hạn", "", 1, "", "", "Công việc", "Admin", "", "", "", "", ""],
    // Việc 2: Quá hạn
    ["Viec 2", "Noi dung", "2026-06-12 11:00:00", "", "Không", "G_ANOM_TASK", "U_ANOM_A", 0, "Ảnh", "Trung bình", "", "Quá hạn", "", 1, "", "", "Công việc", "Admin", "", "", "", "", ""],
    // Việc 3: Nhắc 4 lần chưa xử lý
    ["Viec 3", "Noi dung", "2026-06-12 12:00:00", "", "Không", "G_ANOM_TASK", "U_ANOM_B", 0, "Ảnh", "Trung bình", "", "Chưa hoàn thành", "", 4, "", "", "Công việc", "Admin", "", "", "", "", ""]
  ];
  allSheetsData["Interaction_Logs"] = [
    ["Thời gian", "Ngày", "Giờ", "Group ID", "Group Name", "User ID", "Tên Line", "Loại tương tác", "Nội dung rút gọn", "Task ID", "Điểm tương tác", "Nguồn", "Ghi chú"]
  ];

  const anomalies = mockSandbox.detectTaskAnomalies("G_ANOM_TASK");
  // Kiểm tra phát hiện việc quá hạn theo assignee
  assert.ok(anomalies.some(a => a.includes("có 2 việc quá hạn")));
  // Kiểm tra nhắc quá 3 lần
  assert.ok(anomalies.some(a => a.includes("bị nhắc 4 lần chưa xử lý")));
});

runTest("Test thành viên im lặng bất thường & nhận việc không phản hồi", () => {
  allSheetsData["Group_Settings"] = [
    ["Group ID", "Group Name", "Bật cảnh báo im lặng", "Số phút im lặng", "Giờ bắt đầu theo dõi", "Giờ kết thúc theo dõi", "Lần cảnh báo cuối", "Trạng thái", "Bật báo cáo cuối ngày", "Giờ gửi báo cáo", "Lần gửi báo cáo cuối", "Bật cảnh báo bất thường", "Ngưỡng giảm tương tác (%)", "Ngưỡng việc quá hạn", "Lần cảnh báo bất thường cuối"],
    ["G_ANOM_SILENT", "Nhóm Im Lặng", "Không", 90, 8, 18, "", "Đang hoạt động", "Không", "", "", "Có", 30, 2, ""]
  ];
  
  // U00000000000000000000000000000001 (Thành viên Một) hoạt động tuần qua nhưng hôm nay im lặng
  allSheetsData["ID_Member"] = [
    ["Tên Line", "ID Line"],
    ["Thành viên Một", "U00000000000000000000000000000001"],
    ["Thành viên Hai", "U00000000000000000000000000000002"]
  ];

  const tz = mockSandbox.Session.getScriptTimeZone();
  const timeToday = new Date();
  const timeTodayStr = mockSandbox.Utilities.formatDate(timeToday, tz, "yyyy-MM-dd HH:mm:ss");

  allSheetsData["Interaction_Logs"] = [
    ["Thời gian", "Ngày", "Giờ", "Group ID", "Group Name", "User ID", "Tên Line", "Loại tương tác", "Nội dung rút gọn", "Task ID", "Điểm tương tác", "Nguồn", "Ghi chú"]
  ];
  
  // Thành viên Một hoạt động tuần trước
  for (let d = 1; d <= 3; d++) {
    const timeHist = new Date(timeToday.getTime() - d * 24 * 3600 * 1000);
    const timeHistStr = mockSandbox.Utilities.formatDate(timeHist, tz, "yyyy-MM-dd HH:mm:ss");
    allSheetsData["Interaction_Logs"].push([
      timeHistStr, timeHistStr.split(" ")[0], timeHistStr, "G_ANOM_SILENT", "Nhóm Im Lặng", "U00000000000000000000000000000001", "Thành viên Một", "text", "hello", "", 1, "Webhook", ""
    ]);
  }

  // Thêm task được giao hôm nay cho Thành viên Hai
  allSheetsData["Sự kiện"] = [
    ["Tên sự kiện", "Nội dung", "Ngày giờ gửi", "Link ảnh đính kèm", "Lặp lại", "Nhóm nhận", "Người phụ trách", "Tần suất (phút)", "Hình thức xác nhận", "Độ ưu tiên", "Người xác nhận", "Trạng thái", "Lần nhắc cuối", "Số lần nhắc", "Link Ảnh Nghiệm Thu", "Deadline", "Loại công việc", "Người giao việc", "Người theo dõi", "Ghi chú", "Trạng thái xử lý chi tiết", "Lịch sử cập nhật", "Đã nhắc trước deadline"],
    ["Viec gap", "Noi dung", timeTodayStr, "", "Không", "G_ANOM_SILENT", "U00000000000000000000000000000002", 0, "Ảnh", "Trung bình", "", "Chưa hoàn thành", "", 1, "", "", "Công việc", "Admin", "", "", "", "", ""]
  ];

  // Gọi check tương tác bất thường
  const intAnomalies = mockSandbox.detectInteractionAnomalies("G_ANOM_SILENT");
  assert.ok(intAnomalies.some(a => a.includes("Thành viên Thành viên Một thường tương tác nhiều nhưng hôm nay không tương tác")));

  // Gọi check task bất thường
  const taskAnomalies = mockSandbox.detectTaskAnomalies("G_ANOM_SILENT");
  assert.ok(taskAnomalies.some(a => a.includes("Nhân sự Thành viên Hai nhận việc nhưng không có tương tác phản hồi hôm nay")));
});

runTest("Test chống gửi cảnh báo trùng lặp liên tiếp trong ngày", () => {
  const ss = mockSandbox.getSpreadsheet();
  const settingsSheet = ss.getSheetByName("Group_Settings");
  
  allSheetsData["Group_Settings"] = [
    ["Group ID", "Group Name", "Bật cảnh báo im lặng", "Số phút im lặng", "Giờ bắt đầu theo dõi", "Giờ kết thúc theo dõi", "Lần cảnh báo cuối", "Trạng thái", "Bật báo cáo cuối ngày", "Giờ gửi báo cáo", "Lần gửi báo cáo cuối", "Bật cảnh báo bất thường", "Ngưỡng giảm tương tác (%)", "Ngưỡng việc quá hạn", "Lần cảnh báo bất thường cuối"],
    ["G_ANOM_ALERT", "Nhóm Cảnh Báo", "Không", 90, 8, 18, "", "Đang hoạt động", "Không", "", "", "Có", 30, 2, ""]
  ];

  // 1. Lần đầu: nên được gửi
  const firstCheck = mockSandbox.shouldSendAnomalyAlert("G_ANOM_ALERT");
  assert.strictEqual(firstCheck, true);

  // 2. Ghi nhận đã gửi
  mockSandbox.markAnomalyAlertSent("G_ANOM_ALERT");

  // 3. Lần hai: không được gửi lại trong cùng ngày
  const secondCheck = mockSandbox.shouldSendAnomalyAlert("G_ANOM_ALERT");
  assert.strictEqual(secondCheck, false);
});

runTest("Test checkAndSendAnomalyAlerts thực sự gửi tới admin", () => {
  replies.length = 0;
  allSheetsData["Group_Settings"] = [
    ["Group ID", "Group Name", "Bật cảnh báo im lặng", "Số phút im lặng", "Giờ bắt đầu theo dõi", "Giờ kết thúc theo dõi", "Lần cảnh báo cuối", "Trạng thái", "Bật báo cáo cuối ngày", "Giờ gửi báo cáo", "Lần gửi báo cáo cuối", "Bật cảnh báo bất thường", "Ngưỡng giảm tương tác (%)", "Ngưỡng việc quá hạn", "Lần cảnh báo bất thường cuối"],
    ["G_ANOM_SEND", "Nhóm Báo Cảnh Báo", "Không", 90, 8, 18, "", "Đang hoạt động", "Không", "", "", "Có", 30, 2, ""]
  ];
  allSheetsData["Sự kiện"] = [
    ["Tên sự kiện", "Nội dung", "Ngày giờ gửi", "Link ảnh đính kèm", "Lặp lại", "Nhóm nhận", "Người phụ trách", "Tần suất (phút)", "Hình thức xác nhận", "Độ ưu tiên", "Người xác nhận", "Trạng thái", "Lần nhắc cuối", "Số lần nhắc", "Link Ảnh Nghiệm Thu", "Deadline", "Loại công việc", "Người giao việc", "Người theo dõi", "Ghi chú", "Trạng thái xử lý chi tiết", "Lịch sử cập nhật", "Đã nhắc trước deadline"],
    ["Viec Tre", "Noi dung", "2026-06-12 10:00:00", "", "Không", "G_ANOM_SEND", "U_ANOM_A", 0, "Ảnh", "Trung bình", "", "Quá hạn", "", 1, "", "", "Công việc", "Admin", "", "", "", "", ""],
    ["Viec Tre 2", "Noi dung", "2026-06-12 11:00:00", "", "Không", "G_ANOM_SEND", "U_ANOM_A", 0, "Ảnh", "Trung bình", "", "Quá hạn", "", 1, "", "", "Công việc", "Admin", "", "", "", "", ""]
  ];
  
  mockSandbox.checkAndSendAnomalyAlerts();
  
  assert.strictEqual(replies.length, 2);
  assert.ok(replies[0].text.includes("CẢNH BÁO BẤT THƯỜNG"));
  assert.strictEqual(replies[0].replyToken, "U40778c187ce6a4e3ff38f5f00e998799");
  assert.strictEqual(replies[1].replyToken, "Ue6adbc54620f4c9c22e4c2755e09f5ff");
});

runTest("Test lệnh tương tác bot LINE (/batthuong, /canhbao, /nhanxet)", () => {
  replies.length = 0;
  
  allSheetsData["Group_Settings"] = [
    ["Group ID", "Group Name", "Bật cảnh báo im lặng", "Số phút im lặng", "Giờ bắt đầu theo dõi", "Giờ kết thúc theo dõi", "Lần cảnh báo cuối", "Trạng thái", "Bật báo cáo cuối ngày", "Giờ gửi báo cáo", "Lần gửi báo cáo cuối", "Bật cảnh báo bất thường", "Ngưỡng giảm tương tác (%)", "Ngưỡng việc quá hạn", "Lần cảnh báo bất thường cuối"],
    ["G_ANOM_SILENT", "Nhóm Im Lặng", "Không", 90, 8, 18, "", "Đang hoạt động", "Không", "", "", "Có", 30, 2, ""]
  ];
  allSheetsData["ID_Member"] = [
    ["Tên Line", "ID Line"],
    ["Thành viên Một", "U00000000000000000000000000000001"],
    ["Thành viên Hai", "U00000000000000000000000000000002"]
  ];

  const tz = mockSandbox.Session.getScriptTimeZone();
  const timeToday = new Date();
  const timeTodayStr = mockSandbox.Utilities.formatDate(timeToday, tz, "yyyy-MM-dd HH:mm:ss");

  allSheetsData["Interaction_Logs"] = [
    ["Thời gian", "Ngày", "Giờ", "Group ID", "Group Name", "User ID", "Tên Line", "Loại tương tác", "Nội dung rút gọn", "Task ID", "Điểm tương tác", "Nguồn", "Ghi chú"]
  ];
  
  // U00000000000000000000000000000001 (Thành viên Một) hoạt động tuần trước
  for (let d = 1; d <= 3; d++) {
    const timeHist = new Date(timeToday.getTime() - d * 24 * 3600 * 1000);
    const timeHistStr = mockSandbox.Utilities.formatDate(timeHist, tz, "yyyy-MM-dd HH:mm:ss");
    allSheetsData["Interaction_Logs"].push([
      timeHistStr, timeHistStr.split(" ")[0], timeHistStr, "G_ANOM_SILENT", "Nhóm Im Lặng", "U00000000000000000000000000000001", "Thành viên Một", "text", "hello", "", 1, "Webhook", ""
    ]);
  }

  // U00000000000000000000000000000002 (Thành viên Hai) nhận việc
  allSheetsData["Sự kiện"] = [
    ["Tên sự kiện", "Nội dung", "Ngày giờ gửi", "Link ảnh đính kèm", "Lặp lại", "Nhóm nhận", "Người phụ trách", "Tần suất (phút)", "Hình thức xác nhận", "Độ ưu tiên", "Người xác nhận", "Trạng thái", "Lần nhắc cuối", "Số lần nhắc", "Link Ảnh Nghiệm Thu", "Deadline", "Loại công việc", "Người giao việc", "Người theo dõi", "Ghi chú", "Trạng thái xử lý chi tiết", "Lịch sử cập nhật", "Đã nhắc trước deadline"],
    ["Viec gap", "Noi dung", timeTodayStr, "", "Không", "G_ANOM_SILENT", "U00000000000000000000000000000002", 0, "Ảnh", "Trung bình", "", "Chưa hoàn thành", "", 1, "", "", "Công việc", "Admin", "", "", "", "", ""]
  ];

  const eventGroup = {
    replyToken: "token_anomaly_command",
    source: { groupId: "G_ANOM_SILENT", userId: "U222" }
  };

  const handled = mockSandbox.handleTextCommand(eventGroup, "/batthuong", "U222", "G_ANOM_SILENT");
  assert.strictEqual(handled, true);
  assert.strictEqual(replies.length, 1);
  assert.ok(replies[0].text.includes("CẢNH BÁO BẤT THƯỜNG"));
  assert.ok(replies[0].text.includes("Thành viên Một thường tương tác nhiều"));
  assert.ok(replies[0].text.includes("Thành viên Hai nhận việc nhưng không có tương tác phản hồi"));
});

console.log("\n🎉 TẤT CẢ CÁC TEST CASES ĐÃ THÀNH CÔNG RỰC RỠ!");

