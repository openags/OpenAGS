from PySide6.QtWidgets import (QWidget, QHBoxLayout, QFrame, 
                            QLabel, QTextBrowser, QSizePolicy, QApplication)
from PySide6.QtCore import Qt, QThread, Signal
from PySide6.QtGui import QPixmap
import re
import os
import sys
from chat_ui import Ui_Form
import yaml
from camel.messages import BaseMessage

# 将项目根目录添加到 PYTHONPATH
project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
if project_root not in sys.path:
    sys.path.insert(0, project_root)

from gscientist.agents.gs_agent import GSAgent



class AIThread(QThread):
    """处理AI回复的线程"""
    reply_ready = Signal(str)  # 用于发送AI回复的信号
    error_occurred = Signal(str)  # 用于发送错误信息的信号

    def __init__(self, agent, message):
        super().__init__()
        self.agent = agent
        self.message = message

    def run(self):
        try:
            # Create proper message format for GSAgent
            user_msg = BaseMessage.make_user_message(
                role_name="User",
                content=self.message
            )
            
            # Get response from agent
            response = self.agent.step(user_msg)
            if response and response.msgs:
                self.reply_ready.emit(response.msgs[0].content)
            else:
                self.error_occurred.emit("未收到有效回复，请重试。")
        except Exception as e:
            print(f"Error generating reply: {str(e)}")
            self.error_occurred.emit(f"抱歉，出现了一些问题: {str(e)}")

class ChatWidget(QWidget):
    def __init__(self, parent=None):
        super().__init__(parent)
        self.ui = Ui_Form()
        self.ui.setupUi(self)
        
        # 初始化 AutoGen agent
        config_path = os.path.join(os.path.dirname(__file__), "..", "..", "config", "config.yml")
        with open(config_path, 'r', encoding='utf-8') as file:
            config = yaml.safe_load(file)
        
        llm_config = config['agents'].get("GSAgent")
        self.agent = GSAgent("GSAgent", llm_config) 
        
        # 连接信号
        self.ui.sendButton.clicked.connect(self.on_send_clicked)
        self.ui.messageInput.textChanged.connect(self.adjust_input_height)
        
        # 初始化AI线程
        self.ai_thread = None
        
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
        bubble.setSizePolicy(QSizePolicy.Expanding, QSizePolicy.Minimum)  # 改为 Minimum
        
        # 使用 QTextBrowser
        message = QTextBrowser()
        message.setOpenExternalLinks(True)
        message.setHorizontalScrollBarPolicy(Qt.ScrollBarAlwaysOff)
        message.setVerticalScrollBarPolicy(Qt.ScrollBarAsNeeded)
        message.setSizePolicy(QSizePolicy.Expanding, QSizePolicy.Minimum)  # 改为 Minimum
        
        # 设置富文本内容
        formatted_text = self.format_text(text, is_user)
        message.setHtml(formatted_text)
        
        # 调整文本浏览器大小
        message.document().adjustSize()
        content_height = message.document().size().height()
        message.setFixedHeight(content_height + 10)  # 添加一些边距
        
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
            
            # 创建并启动AI回复线程
            self.ai_thread = AIThread(self.agent, text)
            self.ai_thread.reply_ready.connect(self.handle_ai_reply)
            self.ai_thread.error_occurred.connect(self.handle_error)
            self.ai_thread.finished.connect(lambda: self.ui.sendButton.setEnabled(True))
            self.ai_thread.start()

    def handle_ai_reply(self, reply):
        """处理AI回复"""
        self.add_message(reply, False)

    def handle_error(self, error_message):
        """处理错误"""
        self.add_message(error_message, False)
    
    def adjust_input_height(self):
        """调整输入框高度"""
        doc_height = self.ui.messageInput.document().size().height()
        new_height = min(max(50, doc_height + 10), 200)
        self.ui.messageInput.setFixedHeight(int(new_height))


if __name__ == "__main__":
    app = QApplication(sys.argv)
    widget = ChatWidget()
    widget.show()
    sys.exit(app.exec())
