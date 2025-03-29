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

# Add project root directory to PYTHONPATH
project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
if project_root not in sys.path:
    sys.path.insert(0, project_root)

from gscientist.agents.gs_agent import GSAgent



class AIThread(QThread):
    """Thread for handling AI responses"""
    reply_ready = Signal(str)  # Signal for sending AI responses
    error_occurred = Signal(str)  # Signal for sending error messages

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
                self.error_occurred.emit("No valid response received, please try again.")
        except Exception as e:
            print(f"Error generating reply: {str(e)}")
            self.error_occurred.emit(f"Sorry, something went wrong: {str(e)}")

class ChatWidget(QWidget):
    def __init__(self, parent=None):
        super().__init__(parent)
        self.ui = Ui_Form()
        self.ui.setupUi(self)
        
        # Initialize AutoGen agent
        config_path = os.path.join(os.path.dirname(__file__), "..", "..", "config", "config.yml")
        with open(config_path, 'r', encoding='utf-8') as file:
            config = yaml.safe_load(file)
        
        llm_config = config['agents'].get("GSAgent")
        self.agent = GSAgent("GSAgent", llm_config) 
        
        # Connect signals
        self.ui.sendButton.clicked.connect(self.on_send_clicked)
        self.ui.messageInput.textChanged.connect(self.adjust_input_height)
        
        # Initialize AI thread
        self.ai_thread = None
        
    def format_text(self, text, is_user=True):
        """Format text, handle code blocks, links, etc."""
        formatted_text = text
        
        # Handle code blocks (content surrounded by ```)
        code_pattern = r"```(.*?)```"
        formatted_text = re.sub(code_pattern, self._format_code_block, formatted_text, flags=re.DOTALL)
        
        # Handle links
        url_pattern = r'https?://\S+'
        formatted_text = re.sub(url_pattern, 
            lambda m: f'<a href="{m.group()}" style="color: {"white" if is_user else "blue"}">{m.group()}</a>', 
            formatted_text)
        
        # Handle bold text **text**
        bold_pattern = r'\*\*(.*?)\*\*'
        formatted_text = re.sub(bold_pattern, r'<b>\1</b>', formatted_text)
        
        # Handle italic text *text*
        italic_pattern = r'\*(.*?)\*'
        formatted_text = re.sub(italic_pattern, r'<i>\1</i>', formatted_text)
        
        # Handle line breaks
        formatted_text = formatted_text.replace('\n', '<br>')
        
        return formatted_text
    
    def _format_code_block(self, match):
        """Format code blocks"""
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
        """Add a message"""
        message_widget = QWidget()
        layout = QHBoxLayout(message_widget)
        layout.setContentsMargins(10, 5, 10, 5)
        
        # Create avatar
        avatar = QLabel()
        avatar.setFixedSize(40, 40)
        avatar_path = os.path.join("resources", "user_avatar.png" if is_user else "ai_avatar.png")
        pixmap = QPixmap(avatar_path)
        if pixmap.isNull():
            print(f"Warning: Could not load avatar image from {avatar_path}")
        avatar.setPixmap(pixmap.scaled(40, 40, Qt.KeepAspectRatio, Qt.SmoothTransformation))
        
        # Create bubble
        bubble = QFrame()
        bubble_layout = QHBoxLayout(bubble)
        bubble_layout.setContentsMargins(10, 5, 10, 5)
        bubble.setSizePolicy(QSizePolicy.Expanding, QSizePolicy.Minimum)  # 改为 Minimum
        
        # Use QTextBrowser
        message = QTextBrowser()
        message.setOpenExternalLinks(True)
        message.setHorizontalScrollBarPolicy(Qt.ScrollBarAlwaysOff)
        message.setVerticalScrollBarPolicy(Qt.ScrollBarAsNeeded)
        message.setSizePolicy(QSizePolicy.Expanding, QSizePolicy.Minimum)  # 改为 Minimum
        
        # Set rich text content
        formatted_text = self.format_text(text, is_user)
        message.setHtml(formatted_text)
        
        # Adjust text browser size
        message.document().adjustSize()
        content_height = message.document().size().height()
        message.setFixedHeight(content_height + 10)  # 添加一些边距
        
        # Set styles
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
        
        # Layout arrangement
        if is_user:
            bubble_layout.addWidget(message)
            layout.addWidget(bubble)
            layout.addWidget(avatar)
        else:
            layout.addWidget(avatar)
            layout.addWidget(bubble)
            bubble_layout.addWidget(message)
        
        # Add to message list
        self.ui.messageLayout.insertWidget(
            self.ui.messageLayout.count() - 1,
            message_widget
        )
        
        # Scroll to bottom
        self.ui.scrollArea.verticalScrollBar().setValue(
            self.ui.scrollArea.verticalScrollBar().maximum()
        )

    def on_send_clicked(self):
        """Send button click event"""
        text = self.ui.messageInput.toPlainText().strip()
        if text:
            # Show user message
            self.add_message(text, True)
            self.ui.messageInput.clear()
            
            # Disable send button
            self.ui.sendButton.setEnabled(False)
            
            # Create and start AI response thread
            self.ai_thread = AIThread(self.agent, text)
            self.ai_thread.reply_ready.connect(self.handle_ai_reply)
            self.ai_thread.error_occurred.connect(self.handle_error)
            self.ai_thread.finished.connect(lambda: self.ui.sendButton.setEnabled(True))
            self.ai_thread.start()

    def handle_ai_reply(self, reply):
        """Handle AI response"""
        self.add_message(reply, False)

    def handle_error(self, error_message):
        """Handle error"""
        self.add_message(error_message, False)
    
    def adjust_input_height(self):
        """Adjust input box height"""
        doc_height = self.ui.messageInput.document().size().height()
        new_height = min(max(50, doc_height + 10), 200)
        self.ui.messageInput.setFixedHeight(int(new_height))


if __name__ == "__main__":
    app = QApplication(sys.argv)
    widget = ChatWidget()
    widget.show()
    sys.exit(app.exec())
