import os
import sys
from PySide6.QtWidgets import QApplication, QMainWindow
from PySide6.QtCore import QDir
from main_window_ui import Ui_MainWindow  # 导入UI文件生成的类
from chat import ChatWidget
from research_project_manager import ResearchTreeView

class MainWindow(QMainWindow):
    def __init__(self):
        super().__init__()
        # 创建UI对象
        self.ui = Ui_MainWindow()
        # 设置UI
        self.ui.setupUi(self)
        
        # 连接信号槽
        self.setup_connections()
        
        # 初始化一些设置
        self.init_ui()
    
    def setup_connections(self):
        """设置信号槽连接"""
        # 设置按钮点击事件
        self.ui.pushButton_setting.clicked.connect(self.on_setting_clicked)
        
        # 标签页关闭信号
        self.ui.tabWidget.tabCloseRequested.connect(self.on_tab_close)
    
    def init_ui(self):
        """初始化界面设置"""
        # 可以在这里添加一些初始化设置
        # 比如设置窗口标题、图标等
        self.setWindowTitle("Autonomous Generalist Scientist")
        
        # 初始化左侧树形视图的设置
        self.ui.treeView.setHeaderHidden(True)  # 隐藏树形视图的头部
        
        # 初始化研究项目管理器
    # 可以指定自定义路径，或使用默认路径
        custom_path = os.path.join(QDir.homePath(), "Documents", "My Research Projects")
        self.research_tree = ResearchTreeView(self.ui.treeView, base_path=custom_path)

        self.chat_widget = ChatWidget()
        self.ui.tabWidget.addTab(self.chat_widget, "Chat")

    def on_setting_clicked(self):
        """设置按钮点击事件"""
        # TODO: 实现设置功能
        print("Settings clicked")
    
    def on_tab_close(self, index):
        """标签页关闭事件"""
        # 关闭指定索引的标签页
        self.ui.tabWidget.removeTab(index)

def main():
    # 创建应用程序对象
    app = QApplication(sys.argv)
    
    # 创建并显示主窗口
    window = MainWindow()
    window.show()
    
    # 运行应用程序
    sys.exit(app.exec())

if __name__ == "__main__":
    main()