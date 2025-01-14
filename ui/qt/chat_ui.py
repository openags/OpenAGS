# -*- coding: utf-8 -*-

################################################################################
## Form generated from reading UI file 'chat.ui'
##
## Created by: Qt User Interface Compiler version 6.5.0
##
## WARNING! All changes made in this file will be lost when recompiling UI file!
################################################################################

from PySide6.QtCore import (QCoreApplication, QDate, QDateTime, QLocale,
    QMetaObject, QObject, QPoint, QRect,
    QSize, QTime, QUrl, Qt)
from PySide6.QtGui import (QBrush, QColor, QConicalGradient, QCursor,
    QFont, QFontDatabase, QGradient, QIcon,
    QImage, QKeySequence, QLinearGradient, QPainter,
    QPalette, QPixmap, QRadialGradient, QTransform)
from PySide6.QtWidgets import (QApplication, QFrame, QGridLayout, QHBoxLayout,
    QPushButton, QScrollArea, QSizePolicy, QSpacerItem,
    QTextEdit, QVBoxLayout, QWidget)

class Ui_Form(object):
    def setupUi(self, Form):
        if not Form.objectName():
            Form.setObjectName(u"Form")
        Form.resize(718, 607)
        self.gridLayout = QGridLayout(Form)
        self.gridLayout.setObjectName(u"gridLayout")
        self.scrollArea = QScrollArea(Form)
        self.scrollArea.setObjectName(u"scrollArea")
        self.scrollArea.setFrameShape(QFrame.NoFrame)
        self.scrollArea.setWidgetResizable(True)
        self.scrollAreaWidgetContents = QWidget()
        self.scrollAreaWidgetContents.setObjectName(u"scrollAreaWidgetContents")
        self.scrollAreaWidgetContents.setGeometry(QRect(0, 0, 700, 483))
        self.messageLayout = QVBoxLayout(self.scrollAreaWidgetContents)
        self.messageLayout.setSpacing(10)
        self.messageLayout.setObjectName(u"messageLayout")
        self.verticalSpacer = QSpacerItem(20, 40, QSizePolicy.Minimum, QSizePolicy.Expanding)

        self.messageLayout.addItem(self.verticalSpacer)

        self.scrollArea.setWidget(self.scrollAreaWidgetContents)

        self.gridLayout.addWidget(self.scrollArea, 0, 0, 1, 1)

        self.inputWidget = QWidget(Form)
        self.inputWidget.setObjectName(u"inputWidget")
        self.inputWidget.setMinimumSize(QSize(0, 50))
        self.inputWidget.setMaximumSize(QSize(16777215, 100))
        self.horizontalLayout = QHBoxLayout(self.inputWidget)
        self.horizontalLayout.setSpacing(10)
        self.horizontalLayout.setObjectName(u"horizontalLayout")
        self.horizontalLayout.setContentsMargins(0, 0, 0, 0)
        self.messageInput = QTextEdit(self.inputWidget)
        self.messageInput.setObjectName(u"messageInput")
        self.messageInput.setMinimumSize(QSize(0, 50))
        self.messageInput.setMaximumSize(QSize(16777215, 200))

        self.horizontalLayout.addWidget(self.messageInput)

        self.verticalLayout = QVBoxLayout()
        self.verticalLayout.setObjectName(u"verticalLayout")
        self.sendButton = QPushButton(self.inputWidget)
        self.sendButton.setObjectName(u"sendButton")
        self.sendButton.setMinimumSize(QSize(0, 0))
        self.sendButton.setMaximumSize(QSize(30, 30))
        self.sendButton.setCursor(QCursor(Qt.PointingHandCursor))
        icon = QIcon()
        icon.addFile(u"resources/send.png", QSize(), QIcon.Normal, QIcon.Off)
        self.sendButton.setIcon(icon)
        self.sendButton.setIconSize(QSize(30, 30))
        self.sendButton.setCheckable(False)
        self.sendButton.setAutoDefault(False)
        self.sendButton.setFlat(True)

        self.verticalLayout.addWidget(self.sendButton)

        self.attachedButton = QPushButton(self.inputWidget)
        self.attachedButton.setObjectName(u"attachedButton")
        self.attachedButton.setMinimumSize(QSize(0, 0))
        self.attachedButton.setMaximumSize(QSize(30, 30))
        self.attachedButton.setCursor(QCursor(Qt.PointingHandCursor))
        icon1 = QIcon()
        icon1.addFile(u"resources/attachedfiles.png", QSize(), QIcon.Normal, QIcon.Off)
        self.attachedButton.setIcon(icon1)
        self.attachedButton.setIconSize(QSize(25, 25))
        self.attachedButton.setCheckable(True)
        self.attachedButton.setFlat(True)

        self.verticalLayout.addWidget(self.attachedButton)

        self.verticalSpacer_2 = QSpacerItem(20, 40, QSizePolicy.Minimum, QSizePolicy.Expanding)

        self.verticalLayout.addItem(self.verticalSpacer_2)


        self.horizontalLayout.addLayout(self.verticalLayout)


        self.gridLayout.addWidget(self.inputWidget, 1, 0, 1, 1)


        self.retranslateUi(Form)

        QMetaObject.connectSlotsByName(Form)
    # setupUi

    def retranslateUi(self, Form):
        Form.setWindowTitle(QCoreApplication.translate("Form", u"Form", None))
        self.messageInput.setPlaceholderText(QCoreApplication.translate("Form", u"Type a message...", None))
        self.sendButton.setText("")
        self.attachedButton.setText("")
    # retranslateUi

