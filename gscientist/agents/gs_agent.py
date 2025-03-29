import os
import yaml
from camel.agents import ChatAgent
from camel.messages import BaseMessage
from camel.models import ModelFactory
from camel.types import ModelPlatformType, ModelType

class GSAgent(ChatAgent):
    def __init__(self, name='GSAgent', llm_config=None):
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
        
        super().__init__(
            system_message=sys_msg,
            model=model,
            message_window_size=10  # Maintain conversation history window
        )
        

if __name__ == "__main__":
    # Load YAML configuration file
    with open(os.path.join("config", "config.yml"), "r") as f:
        config = yaml.safe_load(f)


    agent = GSAgent('GSAgent', config)
    
    # Create user message
    user_msg = BaseMessage.make_user_message(
        role_name="User",
        content="Give me investment suggestion in 3 bullet points."
    )
    
    # Get response
    response = agent.step(user_msg)
    print(response.msgs[0].content)