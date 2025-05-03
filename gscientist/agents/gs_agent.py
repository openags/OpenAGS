import os
import yaml
from camel.agents import ChatAgent
from camel.messages import BaseMessage
from camel.models import ModelFactory
from camel.types import ModelPlatformType, ModelType
from gscientist.agents.base_agent import BaseAgent

class GSAgent(ChatAgent, BaseAgent):
    def __init__(self, name='GSAgent', llm_config=None, tools=None):
        BaseAgent.__init__(self, name)
        """Initialize a GSAgent instance.

        Args:
            name (str): Name of the agent
            llm_config (dict): Configuration dictionary containing:
                - model_platform: Platform type (e.g., openai, azure, etc.)
                - model_type: Model type (e.g., gpt-4, glm-4, etc.)
                - api_key: API key for the platform
                - model_config_dict: Additional model configuration (e.g., temperature, max_tokens, etc.)
        """

        self.type = "GSAgent"

        llm_config = llm_config['agents'].get(self.type)

        # Ensure required keys are present in the configuration
        required_keys = ["model_platform", "model_type", "api_key"]
        for key in required_keys:
            if key not in llm_config:
                raise ValueError(f"Missing required configuration key: {key}")

        # Create system message for assistant role
        sys_msg = BaseMessage.make_assistant_message(
            role_name=name,
            content="You are a helpful AI research assistant."
        )
        
        # Dynamically initialize the model based on llm_config
        model = ModelFactory.create(
            model_platform=ModelPlatformType(llm_config["model_platform"]),
            model_type=ModelType(llm_config["model_type"]),
            api_key=llm_config["api_key"],
            url=llm_config["url"],
            model_config_dict=llm_config["model_config_dict"]
        )
        
        ChatAgent.__init__(
            self,
            system_message=sys_msg,
            model=model,
            tools=tools,
            message_window_size=10  # Maintain conversation history window
        )

    def reset(self):
        self.log("Resetting GSAgent...")
        self.state.clear()

    def step(self, input_data: str) -> str:
        self.log(f"Processing input: {input_data}")
        user_msg = BaseMessage.make_user_message(
            role_name="User",
            content=input_data
        )
        response = ChatAgent.step(self, user_msg)
        return response.msgs[0].content

    async def a_step(self, input_data: str) -> str:
        """异步处理输入消息并返回字符串响应"""
        return ""

    async def stream_step(self, input_data: str):
        """流式处理输入消息并返回响应片段"""
        return ""

    def reset(self):
        self.log("Resetting GSAgent...")
        self.state.clear()
        

if __name__ == "__main__":
    # Load YAML configuration file
    with open(os.path.join("config", "config.yml"), "r") as f:
        config = yaml.safe_load(f)


    agent = GSAgent('GSAgent', config)
    
    # Get response
    response = agent.step("Give me investment suggestion in 3 bullet points.")
    print(response)