from PySide6.QtWidgets import (QWidget, QHBoxLayout, QFrame, 
                            QLabel, QTextBrowser, QSizePolicy)
from PySide6.QtCore import Qt
from PySide6.QtGui import QPixmap
import re
import os
from autogen import ConversableAgent
from chat_ui import Ui_Form

class ChatWidget(QWidget):
    def __init__(self, parent=None):
        super().__init__(parent)
        self.ui = Ui_Form()
        self.ui.setupUi(self)
        
        # 初始化 AutoGen agent
        self.agent = ConversableAgent(
            "chatbot",
            llm_config={   
                "model": "deepseek-chat",
                "api_type": "deepseek",
                "api_key": "sk-161232a17dfd47c3b4a895a3da6278fc",
                "base_url": "https://api.deepseek.com",
                "price": [0.00014, 0.00028]
            },
            code_execution_config=False,
            human_input_mode="NEVER"  # 不请求人类输入
        )
        
        # 连接信号
        self.ui.sendButton.clicked.connect(self.on_send_clicked)
        self.ui.messageInput.textChanged.connect(self.adjust_input_height)
        
    def format_text(self, text, is_user=True):
        """格式化文本，处理代码块、链接等"""
        formatted_text = text
        
        # 处理代码块 (被```包围的内容)
        code_pattern = r"```(.*?)```"
        formatted_text = re.sub(code_pattern, self._format_code_block, formatted_text, flags=re.DOTALL)
        
        # 处理链接
        url_pattern = r'https?://\S+'
        formatted_text = re.sub(url_pattern, 
            lambda m: f'<a href="{m.group()}" style="color: {"white" if is_user else "blue"}">{m.group()}</a>', 
            formatted_text)
        
        # 处理粗体 **text**
        bold_pattern = r'\*\*(.*?)\*\*'
        formatted_text = re.sub(bold_pattern, r'<b>\1</b>', formatted_text)
        
        # 处理斜体 *text*
        italic_pattern = r'\*(.*?)\*'
        formatted_text = re.sub(italic_pattern, r'<i>\1</i>', formatted_text)
        
        # 处理换行
        formatted_text = formatted_text.replace('\n', '<br>')
        
        return formatted_text
    
    def _format_code_block(self, match):
        """格式化代码块"""
        code = match.group(1).strip()
        return f"""
            <pre style='
                background-color: #1e1e1e;
                color: #d4d4d4;
                padding: 10px;
                border-radius: 5px;
                font-family: "Courier New", monospace;
                white-space: pre-wrap;
                margin: 5px 0;
            '>{code}</pre>
        """
    
    def add_message(self, text, is_user=True):
        """添加一条消息"""
        message_widget = QWidget()
        layout = QHBoxLayout(message_widget)
        layout.setContentsMargins(10, 5, 10, 5)
        
        # 创建头像
        avatar = QLabel()
        avatar.setFixedSize(40, 40)
        avatar_path = os.path.join("resources", "user_avatar.png" if is_user else "ai_avatar.png")
        pixmap = QPixmap(avatar_path)
        if pixmap.isNull():
            print(f"Warning: Could not load avatar image from {avatar_path}")
        avatar.setPixmap(pixmap.scaled(40, 40, Qt.KeepAspectRatio, Qt.SmoothTransformation))
        
        # 创建气泡
        bubble = QFrame()
        bubble_layout = QHBoxLayout(bubble)
        bubble_layout.setContentsMargins(10, 5, 10, 5)
        bubble.setSizePolicy(QSizePolicy.Expanding, QSizePolicy.Preferred)
        
        # 使用 QTextBrowser
        message = QTextBrowser()
        message.setOpenExternalLinks(True)
        message.setHorizontalScrollBarPolicy(Qt.ScrollBarAlwaysOff)
        message.setVerticalScrollBarPolicy(Qt.ScrollBarAsNeeded)
        message.setSizePolicy(QSizePolicy.Expanding, QSizePolicy.Preferred)
        
        # 设置富文本内容
        formatted_text = self.format_text(text, is_user)
        message.setHtml(formatted_text)
        
        # 调整大小
        message.document().adjustSize()
        message.setMinimumHeight(int(message.document().size().height()))
        
        # 设置样式
        bubble.setStyleSheet(f"""
            QFrame {{
                background-color: {'#007AFF' if is_user else '#E9E9EB'};
                border-radius: 15px;
            }}
        """)
        message.setStyleSheet(f"""
            QTextBrowser {{
                background: transparent;
                border: none;
                color: {'white' if is_user else 'black'};
            }}
        """)
        
        # 布局排列
        if is_user:
            bubble_layout.addWidget(message)
            layout.addWidget(bubble)
            layout.addWidget(avatar)
        else:
            layout.addWidget(avatar)
            layout.addWidget(bubble)
            bubble_layout.addWidget(message)
        
        # 添加到消息列表
        self.ui.messageLayout.insertWidget(
            self.ui.messageLayout.count() - 1,
            message_widget
        )
        
        # 滚动到底部
        self.ui.scrollArea.verticalScrollBar().setValue(
            self.ui.scrollArea.verticalScrollBar().maximum()
        )
    
    def on_send_clicked(self):
        """发送按钮点击事件"""
        text = self.ui.messageInput.toPlainText().strip()
        if text:
            # 显示用户消息
            self.add_message(text, True)
            self.ui.messageInput.clear()
            
            # 禁用发送按钮
            self.ui.sendButton.setEnabled(False)
            
            try:
                # 使用 generate_reply 获取回复
                reply = self.agent.generate_reply(
                    messages=[{"content": text, "role": "user"}]
                )
                
                # 显示助手回复
                if reply:
                    self.add_message(reply, False)
            except Exception as e:
                print(f"Error generating reply: {str(e)}")
            finally:
                # 重新启用发送按钮
                self.ui.sendButton.setEnabled(True)
    
    def adjust_input_height(self):
        """调整输入框高度"""
        doc_height = self.ui.messageInput.document().size().height()
        new_height = min(max(50, doc_height + 10), 200)
        self.ui.messageInput.setFixedHeight(int(new_height))